from io import BytesIO

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Farm, Scan, User

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/monthly")
async def monthly_report(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    total_farm_query = select(func.count(Farm.id))
    user_farm_query = select(func.count(Farm.id)).where(Farm.user_id == current_user.id)
    scan_query = select(Scan.disease_name, func.count(Scan.id)).group_by(Scan.disease_name).order_by(func.count(Scan.id).desc())
    if current_user.role.name == "farmer":
        scan_query = scan_query.where(Scan.user_id == current_user.id)
    total_farm_count = (await db.execute(total_farm_query)).scalar_one()
    user_farm_count = (await db.execute(user_farm_query)).scalar_one()
    disease_rows = (await db.execute(scan_query.limit(10))).all()
    return {
        "farm_count": total_farm_count,
        "user_farm_count": user_farm_count,
        "disease_breakdown": [{"disease": row[0], "count": row[1]} for row in disease_rows],
        "recommendation": "Prioritize farm visits for fields with repeated high-confidence disease detections.",
    }


@router.get("/monthly.pdf")
async def monthly_report_pdf(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> StreamingResponse:
    data = await monthly_report(current_user, db)
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    pdf.setTitle("AgriScan Monthly Analytics")
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(72, 790, "AgriScan Monthly Analytics")
    pdf.setFont("Helvetica", 11)
    pdf.drawString(72, 760, f"Generated for: {current_user.full_name} ({current_user.role.name})")
    pdf.drawString(72, 735, f"Registered farms (system-wide): {data['farm_count']}")
    pdf.drawString(72, 717, f"Your farms: {data['user_farm_count']}")
    pdf.drawString(72, 692, "Disease breakdown:")
    y = 672
    if data["disease_breakdown"]:
        for row in data["disease_breakdown"]:
            pdf.drawString(90, y, f"- {row['disease']}: {row['count']} scan(s)")
            y -= 18
    else:
        pdf.drawString(90, y, "- No disease scans yet.")
        y -= 18
    pdf.drawString(72, y - 10, data["recommendation"])
    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=agriscan-monthly-report.pdf"},
    )
