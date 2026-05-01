import runpy
from pathlib import Path


ML_SCRIPT = Path(__file__).resolve().parent / "backend" / "app" / "ml" / "model_accuracy.py"


if __name__ == "__main__":
    runpy.run_path(str(ML_SCRIPT), run_name="__main__")
