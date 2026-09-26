# ============================================================================
# tools/android/grab-window.ps1 - capture a window of a running process to PNG
# ----------------------------------------------------------------------------
# Why: LDPlayer's adb bridge reports "device offline" in this environment, so
# `adb shell screencap` is unavailable. But the emulator window itself is a
# normal Windows window, so we can photograph it from the outside.
# PrintWindow works even when the window is occluded or off-screen.
#
# Usage:
#   powershell -File tools/android/grab-window.ps1 -Process dnplayer -Out shot.png
# ============================================================================
param(
  [string]$Process = 'dnplayer',
  [string]$Out = 'shot.png',
  [int]$MinWidth = 400,
  [int]$MinHeight = 400
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinCap {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@

$targets = @()
$pids = (Get-Process -Name $Process -ErrorAction SilentlyContinue).Id
if (-not $pids) { Write-Error "process '$Process' is not running"; exit 1 }

$cb = [WinCap+EnumProc]{
  param($hWnd, $lParam)
  $pid2 = 0
  [void][WinCap]::GetWindowThreadProcessId($hWnd, [ref]$pid2)
  if ($pids -contains $pid2 -and [WinCap]::IsWindowVisible($hWnd)) {
    $r = New-Object WinCap+RECT
    if ([WinCap]::GetWindowRect($hWnd, [ref]$r)) {
      $w = $r.Right - $r.Left; $h = $r.Bottom - $r.Top
      if ($w -ge $MinWidth -and $h -ge $MinHeight) {
        $len = [WinCap]::GetWindowTextLength($hWnd)
        $sb = New-Object System.Text.StringBuilder ($len + 2)
        [void][WinCap]::GetWindowText($hWnd, $sb, $sb.Capacity)
        $script:targets += [pscustomobject]@{
          Handle = $hWnd; W = $w; H = $h; L = $r.Left; T = $r.Top; Title = $sb.ToString(); Area = $w * $h
        }
      }
    }
  }
  return $true
}
[void][WinCap]::EnumWindows($cb, [IntPtr]::Zero)

if (-not $targets.Count) { Write-Error "no visible window >= ${MinWidth}x${MinHeight} in $Process"; exit 1 }
$win = $targets | Sort-Object Area -Descending | Select-Object -First 1
Write-Host ("window: '" + $win.Title + "'  " + $win.W + "x" + $win.H + "  hwnd=" + $win.Handle)

$bmp = New-Object System.Drawing.Bitmap($win.W, $win.H)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $gfx.GetHdc()
# 2 = PW_RENDERFULLCONTENT (needed for GPU-composited windows such as emulators)
$ok = [WinCap]::PrintWindow($win.Handle, $hdc, 2)
$gfx.ReleaseHdc($hdc)
$gfx.Dispose()

# PrintWindow 对**硬件加速**的窗口（模拟器就是）经常返回黑屏或陈旧帧。
# 这时改用"从桌面直流 BitBlt"——屏幕 DC 上放的是合成后的最终画面，
# 硬件加速的内容也在里面。代价是要求窗口不被遮挡（先把它提到最前）。
# 坐标直接用枚举时拿到的 L/T，不再第二次调 GetWindowRect
# （`[ref]$rect2` 在 PS 5.1 里对 New-Object 出来的结构体会报"变量不存在"）。
[void][WinCap]::ShowWindow($win.Handle, 9)      # SW_RESTORE
[void][WinCap]::SetForegroundWindow($win.Handle)
Start-Sleep -Milliseconds 1200
$g2 = [System.Drawing.Graphics]::FromImage($bmp)
$g2.CopyFromScreen($win.L, $win.T, 0, 0, (New-Object System.Drawing.Size($win.W, $win.H)))
$g2.Dispose()
Write-Host ("captured via screen blit; PrintWindow returned " + $ok)

$outPath = [System.IO.Path]::GetFullPath($Out)
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host ("saved: " + $outPath + "  (" + [math]::Round((Get-Item $outPath).Length / 1KB) + " KB)")
