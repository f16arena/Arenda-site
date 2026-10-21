# Забирает свежий бэкап БД Commrent с cloud-001 на этот компьютер.
# Запускается Планировщиком заданий Windows (задача "Commrent backup pull"): каждый день в 10:00
# и при входе в систему; если ПК был выключен — выполнится, как только включится.
# Хранит 60 последних копий в Документы\Commrent-backups.
$ErrorActionPreference = 'Stop'
$dest = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Commrent-backups'
$key  = Join-Path $env:USERPROFILE '.ssh\id_ed25519_cloud001'
$kh   = Join-Path $env:USERPROFILE '.ssh\known_hosts'
$log  = Join-Path $dest 'pull.log'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$file = Join-Path $dest ("commrent-{0}.dump" -f (Get-Date -Format 'yyyyMMdd-HHmm'))
try {
    & "$env:WINDIR\System32\OpenSSH\scp.exe" -q -i $key -o IdentitiesOnly=yes -o BatchMode=yes `
        -o UserKnownHostsFile=$kh root@185.113.132.3:/opt/commrent/backups/daily/latest.dump $file
    if ($LASTEXITCODE -ne 0) { throw "scp exit $LASTEXITCODE" }
    $size = (Get-Item $file).Length
    if ($size -lt 100KB) { throw "подозрительно маленький файл: $size байт" }
    Add-Content -Path $log -Encoding utf8 -Value ("{0} OK {1:N1} МБ {2}" -f (Get-Date -Format s), ($size / 1MB), $file)
    Get-ChildItem $dest -Filter 'commrent-*.dump' | Sort-Object LastWriteTime -Descending |
        Select-Object -Skip 60 | Remove-Item -Force
} catch {
    Add-Content -Path $log -Encoding utf8 -Value ("{0} ОШИБКА {1}" -f (Get-Date -Format s), $_)
    if (Test-Path $file) { Remove-Item $file -Force }
    exit 1
}
