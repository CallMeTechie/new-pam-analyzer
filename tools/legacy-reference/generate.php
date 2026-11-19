<?php
/**
 * Erzeugt Referenzergebnisse mit der UNVERÄNDERTEN Berechnung des alten PAM Analyzers
 * (assets/logic/nxt.php). Die Ausgaben dienen dem neuen Rechenkern als Abnahmetest.
 *
 * Aufruf:
 *   php tools/legacy-reference/generate.php <pfad-zum-alten-repo> packages/core/test/fixtures packages/core/test/legacy
 */
if ($argc !== 4) {
    fwrite(STDERR, "usage: php generate.php <legacy-repo> <fixtures-dir> <out-dir>\n");
    exit(1);
}
[, $legacyRepo, $fixturesDir, $outDir] = $argv;
$fixturesDir = rtrim(realpath($fixturesDir), '/');

define('LANG_DIR', "$legacyRepo/assets/lang");
$_SESSION = ['lang' => 'en'];
require "$legacyRepo/assets/logic/nxt.php";
$config = json_decode(file_get_contents("$legacyRepo/assets/config/config.json"), true);

$files = [];
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($fixturesDir, FilesystemIterator::SKIP_DOTS));
foreach ($it as $f) {
    if (strtolower($f->getExtension()) === 'dat') {
        $files[] = $f->getPathname();
    }
}
sort($files);

foreach ($files as $path) {
    $rel = substr($path, strlen($fixturesDir) + 1);
    $file = ['name' => basename($path), 'tmp_name' => $path, 'error' => UPLOAD_ERR_OK, 'size' => filesize($path)];
    $r = process_file_upload($file, [], $config);
    $h = $r['file_header_info'];
    $out = [
        'source' => $rel,
        'sha256' => hash_file('sha256', $path),
        'file_header_info' => [
            'machine_no' => $h['machine_no'],
            'head_type' => $h['head_type'],
            'head_serial' => $h['head_serial'],
            'tool_type' => $h['tool_type'],
            'tool_serial' => $h['tool_serial'],
            'h08m_variant' => $h['h08m_variant'],
            'date_source' => $h['date_source'],
            // Nur Datumsangaben aus der Kopfzeile sind reproduzierbar
            'test_date' => $h['date_source'] === 'header' ? $h['test_date'] : null,
        ],
        'shaft_count' => $r['raw_data']['shaft_count'],
        'point_count' => count($r['raw_data']['all_points_flat']),
        'expected_components' => get_expected_components($h['head_type'], $h['tool_type'], $h['h08m_variant'], $config),
        'detected_coefficient' => $r['detected_coefficient'],
        'used_coefficient' => $r['used_coefficient'],
        'head_stats_summary' => $r['head_stats_summary'],
        'cpk_results_table' => $r['cpk_results_table'],
        'min_max' => $r['min_max'],
        'x_axis_limits' => $r['x_axis_limits'],
        'y_axis_limits' => $r['y_axis_limits'],
    ];
    $target = "$outDir/" . preg_replace('/\.dat$/i', '.json', $rel);
    @mkdir(dirname($target), 0777, true);
    file_put_contents($target, json_encode($out, JSON_PRETTY_PRINT | JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_SLASHES) . "\n");
}
echo count($files) . " Referenzdateien erzeugt\n";
