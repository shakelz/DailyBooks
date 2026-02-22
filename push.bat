@echo off
echo ===================================
echo   Pushing updates to GitHub...
echo ===================================

git add .
git commit -m "Auto-commit from DailyBooks ERP deploy script"
git push origin main

echo.
echo ===================================
echo   Done! Your Vercel deploy should
echo   start automatically.
echo ===================================
pause
