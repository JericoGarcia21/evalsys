param([Parameter(Mandatory = $true)][string]$DocumentPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
$root = Split-Path $PSScriptRoot -Parent
$stream = [System.IO.File]::Open($DocumentPath, 'Open', 'Read', 'ReadWrite')
$archive = $null
try {
    $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Read, $true)
    $reader = [System.IO.StreamReader]::new($archive.GetEntry('word/document.xml').Open())
    try { [xml]$xml = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $ns = [System.Xml.XmlNamespaceManager]::new($xml.NameTable)
    $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
    function Get-CellText($row) {
        @($row.SelectNodes('w:tc', $ns) | ForEach-Object {
            ($_.SelectNodes('.//w:t', $ns) | ForEach-Object { $_.InnerText }) -join ' '
        })
    }
    $tables = $xml.SelectNodes('//w:body/w:tbl', $ns)
    $template = Get-Content -Raw -Encoding UTF8 "$root/front-end/src/data/databaseRubric.json" | ConvertFrom-Json
    $sections = @('Project Requirements', 'Project Documentation', 'Project Presentation')
    $index = 0
    $totals = @()
    for ($i = 0; $i -lt 3; $i++) {
        $rows = $tables[$i].SelectNodes('w:tr', $ns)
        $total = 0
        for ($j = 1; $j -lt ($rows.Count - 1); $j++) {
            $cells = Get-CellText $rows[$j]
            $actual = $template.criteria[$index]
            $label = $cells[0] -replace '^[A-Z]\.\s*', ''
            $weight = [double]($cells[2] -replace '%', '')
            if ($actual.label -cne $label -or $actual.description -cne $cells[1] -or
                $actual.maxScore -ne $weight -or $actual.section -cne $sections[$i] -or
                $actual.scoringMode -ne 'percentage') { throw "Criterion mismatch: section $($i + 1), row $j" }
            $total += $weight
            $index++
        }
        $totalCells = Get-CellText $rows[$rows.Count - 1]
        if ($total -ne [double]($totalCells[2] -replace '%', '')) { throw 'Section total mismatch' }
        $totals += $total
    }
    if ($index -ne $template.criteria.Count) { throw 'Criterion count mismatch' }
    $instructions = ($xml.SelectNodes('//w:body/w:p', $ns) | ForEach-Object {
        ($_.SelectNodes('.//w:t', $ns) | ForEach-Object { $_.InnerText }) -join ''
    }) -join "`n"
    if ($template.instructions -cne $instructions) { throw 'Instruction text mismatch' }
    $source = Get-Content -Raw -Encoding UTF8 "$root/front-end/src/data/ratingScale.ts"
    $ratings = [regex]::Matches($source, "label: '([^']*)', percentage: (\d+), description: '([^']*)'")
    $ratingRows = $tables[3].SelectNodes('w:tr', $ns)
    if ($ratings.Count -ne ($ratingRows.Count - 1)) { throw 'Rating count mismatch' }
    for ($i = 1; $i -lt $ratingRows.Count; $i++) {
        $cells = Get-CellText $ratingRows[$i]
        $actual = $ratings[$i - 1]
        if ($actual.Groups[1].Value -cne $cells[0] -or $actual.Groups[3].Value -cne $cells[1] -or
            [double]$actual.Groups[2].Value -ne [double]($cells[2] -replace '%', '')) { throw "Rating mismatch: row $i" }
    }
    $stream.Position = 0
    [pscustomobject]@{
        DocumentSHA256 = (Get-FileHash -InputStream $stream -Algorithm SHA256).Hash
        CriteriaMatched = $index; SectionTotals = $totals -join '/'; RatingsMatched = $ratings.Count
        InstructionsMatch = $true; Total = ($totals | Measure-Object -Sum).Sum
    } | ConvertTo-Json
} finally {
    if ($archive) { $archive.Dispose() }
    $stream.Dispose()
}
