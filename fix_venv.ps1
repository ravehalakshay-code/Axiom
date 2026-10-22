# Fix broken .venv paths
Remove-Item -Recurse -Force .venv
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r Backend/requirements.txt
