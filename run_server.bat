@echo off
setlocal
set PORT=8000

echo ==========================================
echo RoadtoJB Juso Service Startup
echo ==========================================

echo [1/2] Checking port %PORT%...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /R /C:":%PORT% *LISTENING"') do (
    if NOT "%%a"=="" ( taskkill /F /PID %%a >nul 2>&1 )
)

echo [2/2] Starting server at http://localhost:%PORT%...

powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=%PORT%; $l=[System.Net.HttpListener]::new(); $l.Prefixes.Add('http://localhost:'+$p+'/'); try { $l.Start() } catch { Write-Host 'Error: Port in use'; exit }; Start-Process 'http://localhost:'+$p; while($l.IsListening){ $c=$l.GetContext(); $q=$c.Request; $r=$c.Response; $path=$q.Url.LocalPath.TrimStart('/'); if([string]::IsNullOrWhiteSpace($path)){$path='index.html'} $f=Join-Path $pwd $path; if(Test-Path $f -PathType Leaf){ $ext=[System.IO.Path]::GetExtension($f).ToLower(); $ct=switch($ext){'.html'{'text/html'} '.js'{'text/javascript'} '.css'{'text/css'} '.json'{'application/json'} default{'application/octet-stream'}}; $r.ContentType=$ct; $b=[System.IO.File]::ReadAllBytes($f); $r.ContentLength64=$b.Length; $r.OutputStream.Write($b,0,$b.Length) }else{ $r.StatusCode=404 }; $r.Close() }"

echo.
echo Server stopped.
pause
