Write-Host "🚀 Deploy başlıyor..." -ForegroundColor Green

git add .

$changes = git status --porcelain
if (-not $changes) {
    Write-Host "❗ Değişiklik yok" -ForegroundColor Yellow
    exit
}

git commit -m "auto update: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

# KRİTİK SATIR 👇
git push origin main --force

Write-Host "✅ Deploy tamamlandı (force push)" -ForegroundColor Green
