@echo off
setlocal
set PORT=8000

echo ==========================================
echo RoadtoJB Juso Service Startup (PowerShell)
echo ==========================================

:: 1. 기존 포트 점유 프로세스 확인 및 종료
echo [1/2] Checking for existing process on port %PORT%...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /R /C:":%PORT% *LISTENING"') do (
    if NOT "%%a"=="" (
        echo Found process with PID %%a on port %PORT%. Attempting to terminate...
        taskkill /F /PID %%a >nul 2>&1
        timeout /t 1 /nobreak >nul
    )
)

:: 2. 윈도우 파워쉘을 이용한 서버 구동
echo [2/2] Starting server at http://localhost:%PORT%...
echo (Check your browser for the opened page)

powershell -NoProfile -Command ^
    "$p=%PORT%; $l=[System.Net.HttpListener]::new(); ^
    $l.Prefixes.Add('http://localhost:'+$p+'/'); ^
    try { $l.Start() } catch { Write-Error 'Could not start listener. Check if port is in use.'; exit }; ^
    Start-Process 'http://localhost:'+$p; ^
    Write-Host \"Server is running at http://localhost:$p\"; ^
    Write-Host 'Press Ctrl+C to stop the server.'; ^
    while($l.IsListening){ ^
        $c=$l.GetContext(); $q=$c.Request; $r=$c.Response; ^
        $path = $q.Url.LocalPath.TrimStart('/'); ^
        if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' } ^
        $f=Join-Path $pwd $path; ^
        if(Test-Path $f -PathType Leaf){ ^
            $ext=[System.IO.Path]::GetExtension($f).ToLower(); ^
            $ct=switch($ext){'.html'{'text/html'} '.js'{'text/javascript'} '.css'{'text/css'} '.json'{'application/json'} default{'application/octet-stream'}}; ^
            $r.ContentType=$ct; ^
            $b=[System.IO.File]::ReadAllBytes($f); ^
            $r.ContentLength64=$b.Length; ^
            $r.OutputStream.Write($b,0,$b.Length) ^
        }else{ $r.StatusCode=404 }; ^
        $r.Close() ^
    }"

echo.
echo Server stopped.
pause
