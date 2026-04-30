from fastapi import APIRouter

from app.api.routes import admin, auth, dashboard, farms, marketplace, notifications, predictions, reports, scans, system, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(dashboard.router)
api_router.include_router(farms.router)
api_router.include_router(scans.router)
api_router.include_router(predictions.router)
api_router.include_router(marketplace.router)
api_router.include_router(notifications.router)
api_router.include_router(reports.router)
api_router.include_router(users.router)
api_router.include_router(admin.router)
api_router.include_router(system.router)
