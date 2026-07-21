const DEFAULT_ADMIN_EMAIL = 'catalogoschaide+chaide2026@gmail.com';
const DEFAULT_FIREBASE_API_KEY = 'AIzaSyCeTJB7qQdRubkSdJ2oIvRl_WSuCsDdqZA';

function doGet() {
  const folder = getRootFolder();
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return jsonResponse({
    ok: true,
    service: 'Chaide Catalogos Drive Bridge',
    version: '1.0.0',
    folderUrl: folder.getUrl(),
  });
}

function setupCatalogos() {
  const folder = getRootFolder();
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const result = {
    ok: true,
    folderId: folder.getId(),
    folderUrl: folder.getUrl(),
    owner: Session.getEffectiveUser().getEmail(),
  };
  console.log(JSON.stringify(result));
  return result;
}

function doPost(event) {
  try {
    const payload = JSON.parse((event && event.postData && event.postData.contents) || '{}');
    const admin = validateFirebaseAdmin(payload.firebaseToken);
    const action = String(payload.action || 'upload');

    if (action === 'upload') return jsonResponse(uploadFile(payload, admin));
    if (action === 'uploadInit') return jsonResponse(uploadInit(payload, admin));
    if (action === 'uploadChunk') return jsonResponse(uploadChunk(payload, admin));
    if (action === 'download') return jsonResponse(downloadFile(payload, admin));
    if (action === 'downloadInfo') return jsonResponse(downloadInfo(payload, admin));
    if (action === 'downloadChunk') return jsonResponse(downloadChunk(payload, admin));
    if (action === 'delete') return jsonResponse(deleteFile(payload, admin));
    if (action === 'deleteByName') return jsonResponse(deleteByName(payload, admin));
    throw new Error('Acción no permitida.');
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || String(error) });
  }
}

function validateFirebaseAdmin(token) {
  if (!token) throw new Error('Sesión Firebase requerida.');
  const properties = PropertiesService.getScriptProperties();
  const apiKey = properties.getProperty('FIREBASE_API_KEY') || DEFAULT_FIREBASE_API_KEY;
  const adminEmail = DEFAULT_ADMIN_EMAIL.toLowerCase();
  if (!apiKey) throw new Error('FIREBASE_API_KEY no configurada.');

  const response = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(apiKey),
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: token }),
      muteHttpExceptions: true,
    },
  );
  const data = JSON.parse(response.getContentText() || '{}');
  const user = data.users && data.users[0];
  if (!user || !user.email || String(user.email).toLowerCase() !== adminEmail) {
    throw new Error('La cuenta no tiene permisos de administrador.');
  }
  return { uid: user.localId, email: user.email };
}

function getRootFolder() {
  const properties = PropertiesService.getScriptProperties();
  const configuredId = properties.getProperty('DRIVE_FOLDER_ID');
  if (configuredId) return DriveApp.getFolderById(configuredId);

  const name = 'Chaide Biblioteca Digital';
  const matches = DriveApp.getFoldersByName(name);
  const folder = matches.hasNext() ? matches.next() : DriveApp.createFolder(name);
  properties.setProperty('DRIVE_FOLDER_ID', folder.getId());
  return folder;
}

function getSubfolder(kind) {
  const allowed = ['catalogs', 'covers', 'banners', 'category-icons'];
  if (allowed.indexOf(kind) === -1) throw new Error('Tipo de archivo no permitido.');
  const root = getRootFolder();
  const matches = root.getFoldersByName(kind);
  return matches.hasNext() ? matches.next() : root.createFolder(kind);
}

function uploadFile(payload, admin) {
  const kind = String(payload.kind || '');
  const fileName = sanitizeFileName(payload.fileName || ('archivo-' + Date.now()));
  const mimeType = String(payload.mimeType || 'application/octet-stream');
  const bytes = Utilities.base64Decode(String(payload.base64 || ''));
  const isPdf = kind === 'catalogs';
  const maxBytes = isPdf ? 35 * 1024 * 1024 : 12 * 1024 * 1024;

  if (!bytes.length) throw new Error('El archivo está vacío.');
  if (bytes.length > maxBytes) throw new Error('El archivo supera el límite permitido.');
  if (isPdf && mimeType !== 'application/pdf') throw new Error('Solo se permiten PDF.');
  if (!isPdf && mimeType.indexOf('image/') !== 0) throw new Error('Solo se permiten imágenes.');

  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const file = getSubfolder(kind).createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  file.setDescription(
    'Subido por ' + admin.email + ' · App v' + String(payload.appVersion || '?'),
  );
  const id = file.getId();
  return {
    ok: true,
    fileId: id,
    driveUrl: 'https://drive.google.com/file/d/' + id + '/view',
    previewUrl: 'https://drive.google.com/file/d/' + id + '/preview',
    downloadUrl: 'https://drive.google.com/uc?export=download&id=' + id,
    thumbnailUrl: isPdf ? '' : 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600',
  };
}

function uploadInit(payload) {
  const kind = String(payload.kind || '');
  const fileName = sanitizeFileName(payload.fileName || ('archivo-' + Date.now()));
  const mimeType = String(payload.mimeType || 'application/octet-stream');
  const size = Number(payload.size || 0);
  const isPdf = kind === 'catalogs';
  const maxBytes = isPdf ? 35 * 1024 * 1024 : 12 * 1024 * 1024;
  if (!Number.isInteger(size) || size <= 0) throw new Error('El archivo está vacío.');
  if (size > maxBytes) throw new Error('El archivo supera el límite permitido.');
  if (isPdf && mimeType !== 'application/pdf') throw new Error('Solo se permiten PDF.');
  if (!isPdf && mimeType.indexOf('image/') !== 0) throw new Error('Solo se permiten imágenes.');

  const response = UrlFetchApp.fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(size),
      },
      payload: JSON.stringify({
        name: fileName,
        mimeType: mimeType,
        parents: [getSubfolder(kind).getId()],
      }),
      muteHttpExceptions: true,
    },
  );
  if (response.getResponseCode() !== 200) {
    throw new Error('Drive no pudo iniciar la subida por bloques.');
  }
  const headers = response.getHeaders();
  const uploadUrl = headers.Location || headers.location;
  if (!uploadUrl) throw new Error('Drive no devolvió una sesión de subida.');
  return {
    ok: true,
    uploadUrl: uploadUrl,
    chunkSize: 1536 * 1024,
    fileName: fileName,
    mimeType: mimeType,
    size: size,
  };
}

function uploadChunk(payload, admin) {
  const uploadUrl = String(payload.uploadUrl || '');
  const from = Number(payload.from);
  const total = Number(payload.total);
  const mimeType = String(payload.mimeType || 'application/octet-stream');
  const bytes = Utilities.base64Decode(String(payload.base64 || ''));
  if (uploadUrl.indexOf('https://www.googleapis.com/upload/drive/v3/files') !== 0) {
    throw new Error('La sesión de subida no es válida.');
  }
  if (!Number.isInteger(from) || from < 0 || !Number.isInteger(total) || total <= 0) {
    throw new Error('El rango de subida no es válido.');
  }
  if (!bytes.length || bytes.length > 1536 * 1024) throw new Error('Bloque de subida inválido.');
  const to = from + bytes.length - 1;
  if (to >= total) throw new Error('El bloque supera el tamaño declarado.');

  const response = UrlFetchApp.fetch(uploadUrl, {
    method: 'put',
    contentType: mimeType,
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'Content-Range': 'bytes ' + from + '-' + to + '/' + total,
    },
    payload: bytes,
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  if (status === 308) return { ok: true, complete: false, nextOffset: to + 1 };
  if (status !== 200 && status !== 201) {
    throw new Error('Drive rechazó un bloque de la subida.');
  }

  const data = JSON.parse(response.getContentText() || '{}');
  if (!data.id) throw new Error('Drive no devolvió el archivo final.');
  const file = DriveApp.getFileById(data.id);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  file.setDescription('Subido por ' + admin.email + ' · subida por bloques');
  const isPdf = mimeType === 'application/pdf';
  return {
    ok: true,
    complete: true,
    fileId: data.id,
    driveUrl: 'https://drive.google.com/file/d/' + data.id + '/view',
    previewUrl: 'https://drive.google.com/file/d/' + data.id + '/preview',
    downloadUrl: 'https://drive.google.com/uc?export=download&id=' + data.id,
    thumbnailUrl: isPdf ? '' : 'https://drive.google.com/thumbnail?id=' + data.id + '&sz=w1600',
  };
}

function deleteFile(payload) {
  const fileId = String(payload.fileId || '');
  if (!fileId) throw new Error('Falta fileId.');
  getManagedFile(fileId);
  permanentlyDeleteManagedFile(fileId);
  return { ok: true, fileId: fileId };
}

function permanentlyDeleteManagedFile(fileId) {
  // Moving a public file to Drive's trash does not immediately invalidate its
  // link. The administrator's explicit delete action must therefore remove the
  // verified managed file permanently.
  const response = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId),
    {
      method: 'delete',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    }
  );
  const status = response.getResponseCode();
  if (status !== 204 && status !== 404) {
    throw new Error('Drive no pudo eliminar definitivamente el respaldo.');
  }
}

function downloadFile(payload) {
  const fileId = String(payload.fileId || '');
  if (!fileId) throw new Error('Falta fileId.');
  const file = getManagedFile(fileId);
  const blob = file.getBlob();
  const bytes = blob.getBytes();
  if (!bytes.length) throw new Error('El respaldo está vacío.');
  if (bytes.length > 35 * 1024 * 1024) {
    throw new Error('El respaldo supera el límite de recuperación.');
  }
  return {
    ok: true,
    fileId: fileId,
    fileName: file.getName(),
    mimeType: blob.getContentType() || 'application/pdf',
    size: bytes.length,
    base64: Utilities.base64Encode(bytes),
  };
}

function downloadInfo(payload) {
  const fileId = String(payload.fileId || '');
  if (!fileId) throw new Error('Falta fileId.');
  const file = getManagedFile(fileId);
  const size = file.getSize();
  const chunkSize = 2 * 1024 * 1024;
  if (!size) throw new Error('El respaldo está vacío.');
  if (size > 35 * 1024 * 1024) throw new Error('El respaldo supera el límite de recuperación.');
  return {
    ok: true,
    fileId: fileId,
    fileName: file.getName(),
    mimeType: file.getMimeType() || 'application/pdf',
    size: size,
    chunkSize: chunkSize,
    chunkCount: Math.ceil(size / chunkSize),
  };
}

function downloadChunk(payload) {
  const fileId = String(payload.fileId || '');
  const index = Number(payload.index);
  if (!fileId) throw new Error('Falta fileId.');
  if (!Number.isInteger(index) || index < 0) throw new Error('Índice de bloque inválido.');
  const file = getManagedFile(fileId);
  const chunkSize = 2 * 1024 * 1024;
  const from = index * chunkSize;
  const size = file.getSize();
  if (from >= size) throw new Error('El bloque solicitado no existe.');
  const to = Math.min(from + chunkSize, size) - 1;
  const response = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media',
    {
      headers: {
        Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
        Range: 'bytes=' + from + '-' + to,
      },
      muteHttpExceptions: true,
    },
  );
  const status = response.getResponseCode();
  if (status !== 200 && status !== 206) {
    throw new Error('Drive no pudo entregar el bloque solicitado.');
  }
  const part = response.getBlob().getBytes();
  if (part.length !== to - from + 1) throw new Error('Drive entregó un bloque incompleto.');
  return {
    ok: true,
    fileId: fileId,
    index: index,
    size: size,
    base64: Utilities.base64Encode(part),
  };
}

function deleteByName(payload) {
  const fileName = sanitizeFileName(payload.fileName || '');
  if (!fileName) throw new Error('Falta fileName.');
  const matches = getSubfolder('catalogs').getFilesByName(fileName);
  let deleted = 0;
  while (matches.hasNext()) {
    permanentlyDeleteManagedFile(matches.next().getId());
    deleted++;
  }
  return { ok: true, fileName: fileName, deleted: deleted };
}

function getManagedFile(fileId) {
  const file = DriveApp.getFileById(fileId);
  const rootId = getRootFolder().getId();
  const parents = file.getParents();
  while (parents.hasNext()) {
    const parent = parents.next();
    const grandparents = parent.getParents();
    while (grandparents.hasNext()) {
      if (grandparents.next().getId() === rootId) return file;
    }
  }
  throw new Error('El archivo no pertenece al respaldo administrado.');
}

function sanitizeFileName(value) {
  return String(value).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 180);
}

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
