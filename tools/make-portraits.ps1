Add-Type -AssemblyName System.Drawing

# Face crop from the rundot T-pose concepts (head fills roughly x 0.33-0.67, y 0.03-0.37)
$monsters = @{
    werewolf = 'art\werewolf-concept.png'
    vampire  = 'art\vampire-concept.png'
    stitched = 'art\stitched-concept.png'
}

foreach ($k in $monsters.Keys) {
    $src = [System.Drawing.Image]::FromFile((Join-Path $PWD $monsters[$k]))
    $cropW = [int]($src.Width * 0.34)
    $cropX = [int]($src.Width * 0.33)
    $cropY = [int]($src.Height * 0.03)
    $rect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropW)
    $out = New-Object System.Drawing.Bitmap(128, 128)
    $g = [System.Drawing.Graphics]::FromImage($out)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, 128, 128)), $rect, [System.Drawing.GraphicsUnit]::Pixel)
    $out.Save((Join-Path $PWD "public\images\portrait-$k.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $out.Dispose(); $src.Dispose()
    Write-Host "public/images/portrait-$k.png"
}
