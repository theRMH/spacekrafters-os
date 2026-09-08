<?php
$ALLOWED_ORIGINS = [
    'https://spacekrafters.com',
    'http://localhost:5173',
    'http://localhost:4173',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $ALLOWED_ORIGINS)) {
    header('Access-Control-Allow-Origin: ' . $origin);
} else {
    header('Access-Control-Allow-Origin: https://spacekrafters.com');
}
header('Access-Control-Allow-Methods: POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Upload-Key');
header('Vary: Origin');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

header('Content-Type: application/json');

// Block requests from disallowed origins (non-browser clients that omit Origin still blocked by key)
if ($origin !== '' && !in_array($origin, $ALLOWED_ORIGINS)) {
    http_response_code(403);
    echo json_encode(['error' => 'Origin not allowed']);
    exit;
}

$SECRET_KEY  = 'Sks_Upload_931f8e0e469b7157';
$UPLOAD_DIR  = __DIR__ . '/uploads/';
$BASE_URL    = 'https://spacekrafters.com/os/uploads/';
$MAX_SIZE    = 20 * 1024 * 1024; // 20 MB
$ALLOWED_TYPES = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    // Audio-only WebM/Opus recordings from MediaRecorder are frequently
    // magic-byte-sniffed as 'video/webm' (or a generic binary type) by
    // libmagic since WebM is a Matroska container — without allowing
    // those too, every voice note recorded in the app gets rejected here
    // with a 415, which is why they never survive to be playable for
    // anyone but the person who recorded them.
    'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'video/webm',
    'application/octet-stream',
];

// Auth
$key = $_SERVER['HTTP_X_UPLOAD_KEY'] ?? '';
if ($key !== $SECRET_KEY) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// Create upload directory
if (!is_dir($UPLOAD_DIR)) {
    mkdir($UPLOAD_DIR, 0755, true);
    // Prevent PHP execution inside uploads dir
    file_put_contents($UPLOAD_DIR . '.htaccess', "php_flag engine off\nOptions -ExecCGI\n");
}

// ── POST: upload ──────────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'No file provided']);
        exit;
    }

    $file = $_FILES['file'];

    if ($file['size'] > $MAX_SIZE) {
        http_response_code(413);
        echo json_encode(['error' => 'File too large (max 20 MB)']);
        exit;
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime  = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    if (!in_array($mime, $ALLOWED_TYPES)) {
        http_response_code(415);
        echo json_encode(['error' => 'File type not allowed: ' . $mime]);
        exit;
    }

    $ext      = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $safeName = preg_replace('/[^a-zA-Z0-9._-]/', '_', pathinfo($file['name'], PATHINFO_FILENAME));
    $filename = uniqid('', true) . '_' . substr($safeName, 0, 40) . '.' . $ext;
    $dest     = $UPLOAD_DIR . $filename;

    if (!move_uploaded_file($file['tmp_name'], $dest)) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save file']);
        exit;
    }

    echo json_encode(['url' => $BASE_URL . $filename]);
    exit;
}

// ── DELETE: remove file ───────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $body     = json_decode(file_get_contents('php://input'), true);
    $url      = $body['url'] ?? '';
    $filename = basename($url);
    $path     = $UPLOAD_DIR . $filename;

    $realDir  = realpath($UPLOAD_DIR);
    $realPath = realpath($path);

    if (!$realPath || strpos($realPath, $realDir) !== 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid file']);
        exit;
    }

    if (file_exists($path)) {
        unlink($path);
    }

    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
