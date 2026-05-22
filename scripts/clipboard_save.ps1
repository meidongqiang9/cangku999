# 从剪贴板保存图片 - Windows PowerShell
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$clip = [System.Windows.Forms.Clipboard]::GetDataObject()
if ($clip.GetDataPresent([System.Drawing.Bitmap])) {
    $img = $clip.GetImage()
    $out = "C:\Users\Administrator\cloud-order-miniprogram\design-refs\clipboard.png"
    $img.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "OK: $out"
    $img.Dispose()
} elseif ($clip.GetFileDropList()) {
    # 剪贴板里有文件路径（比如截图工具保存的文件）
    $files = $clip.GetFileDropList()
    foreach ($f in $files) {
        if ($f -match "\.(png|jpg|jpeg|webp|gif|bmp)$") {
            $dest = "C:\Users\Administrator\cloud-order-miniprogram\design-refs\clipboard.png"
            Copy-Item $f $dest -Force
            Write-Host "OK: $dest (from $f)"
        }
    }
} else {
    # 列出剪贴板中的所有格式
    Write-Host "剪贴板中没有图片。当前格式:"
    foreach ($fmt in $clip.GetFormats()) {
        Write-Host "  $fmt"
    }
}
