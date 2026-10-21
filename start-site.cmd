@echo off
REM ============================================================
REM  Git 用户分析站点 · 一键启动（静态服务 + 公网隧道）
REM  用法：双击运行，或 powershell -File start-site.ps1
REM  依赖：node（任意位置）、E:\dev\tools\cloudflared.exe
REM ============================================================
setlocal
set PROJECT=E:\dev\git-user-analysis-web
set PORT=4322
set CF=E:\dev\tools\cloudflared.exe

echo [1/3] 构建站点...
cd /d "%PROJECT%"
call pnpm run build || (echo 构建失败 & pause & exit /b 1)

echo [2/3] 启动静态服务 (端口 %PORT%)...
REM 若端口被占用，先杀掉旧进程
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT%" ^| findstr LISTENING') do (
    echo    关闭占用端口的旧进程 %%p
    taskkill /F /PID %%p >nul 2>&1
)
start "GitUserAnalysis Static Server" /min cmd /c "cd /d %PROJECT% && node scripts\serve.mjs %PORT% dist > serve.log 2>&1"
timeout /t 3 /nobreak >nul

echo [3/3] 启动公网隧道 (cloudflared)...
if not exist "%CF%" (
    echo    cloudflared 不存在，请先下载到 %CF%
    pause & exit /b 1
)
REM 清空代理变量，否则 cloudflared 连不上 edge
set "http_proxy="
set "https_proxy="
set "HTTP_PROXY="
set "HTTPS_PROXY="
set "ALL_PROXY="
start "GitUserAnalysis Tunnel" /min cmd /c "%CF% tunnel --url http://localhost:%PORT% --no-autoupdate --edge-ip-version 4 --protocol http2 > cf.log 2>&1"
timeout /t 20 /nobreak >nul

echo.
echo ============================================================
echo   本机访问： http://localhost:%PORT%/
echo   局域网：   http://192.168.1.2:%PORT%/
echo.
echo   公网地址： （从 cf.log 中提取，通常在下方）
echo ============================================================
for /f "tokens=*" %%u in ('findstr /r "https://.*trycloudflare.com" "%PROJECT%\cf.log"') do echo     %%u
echo.
echo   关闭方式：结束任务管理器里的 node.exe 与 cloudflared.exe
echo   日志： %PROJECT%\serve.log  和  %PROJECT%\cf.log
echo.
pause
