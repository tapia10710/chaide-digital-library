const DEFAULT_ADMIN_EMAIL = 'catalogoschaide+chaide2026@gmail.com';
const DEFAULT_FIREBASE_API_KEY = 'AIzaSyCeTJB7qQdRubkSdJ2oIvRl_WSuCsDdqZA';

function doGet(event) {
  const parameters = (event && event.parameter) || {};
  const folderId = getRootFolderId();
  return jsonResponse({
    ok: true,
    service: 'Chaide Catalogos Drive Bridge',
    version: '1.0.0',
    folderUrl: 'https://drive.google.com/drive/folders/' + folderId,
  });
}

function setupCatalogos() {
  const folderId = getRootFolderId();
  setDriveFilePublic(folderId);
  const result = {
    ok: true,
    folderId: folderId,
    folderUrl: 'https://drive.google.com/drive/folders/' + folderId,
  };
  console.log(JSON.stringify(result));
  return result;
}

function doPost(event) {
  try {
    const payload = JSON.parse((event && event.postData && event.postData.contents) || '{}');
    const action = String(payload.action || 'upload');

    // Chunk requests use a short-lived HMAC token issued only after uploadInit
    // or downloadInfo authenticated the Firebase administrator. Avoiding a
    // second Identity Toolkit lookup for every block materially improves large
    // transfers without making the Drive session public.
    if (action === 'uploadChunk') {
      validateTransferSession(payload, 'upload', String(payload.uploadUrl || ''), Number(payload.total));
      return jsonResponse(uploadChunk(payload, null));
    }
    if (action === 'uploadStatus') {
      validateTransferSession(payload, 'upload', String(payload.uploadUrl || ''), Number(payload.total));
      return jsonResponse(uploadStatus(payload, null));
    }
    if (action === 'downloadChunk') {
      validateTransferSession(payload, 'download', String(payload.fileId || ''), Number(payload.total));
      return jsonResponse(downloadChunk(payload));
    }

    const admin = validateFirebaseAdmin(payload.firebaseToken);

    if (action === 'upload') return jsonResponse(uploadFile(payload, admin));
    if (action === 'uploadInit') return jsonResponse(uploadInit(payload, admin));
    if (action === 'download') return jsonResponse(downloadFile(payload, admin));
    if (action === 'downloadInfo') return jsonResponse(downloadInfo(payload, admin));
    if (action === 'listCatalogs') return jsonResponse(listCatalogs());
    if (action === 'delete') return jsonResponse(deleteFile(payload, admin));
    if (action === 'deleteByName') return jsonResponse(deleteByName(payload, admin));
    throw new Error('Acción no permitida.');
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || String(error) });
  }
}

function getTransferSessionSecret() {
  const properties = PropertiesService.getScriptProperties();
  let secret = properties.getProperty('TRANSFER_SESSION_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty('TRANSFER_SESSION_SECRET', secret);
  }
  return secret;
}

function transferSessionSignature(scope, key, total, expires) {
  const value = [scope, key, String(total), String(expires)].join('|');
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(value, getTransferSessionSecret()),
  ).replace(/=+$/g, '');
}

function createTransferSession(scope, key, total) {
  // Large catalogs can take a long time on slow connections. The token stays
  // narrowly bound to one upload/download and one exact byte size, while two
  // hours prevents an otherwise healthy transfer from expiring halfway.
  const expires = Date.now() + 2 * 60 * 60 * 1000;
  return {
    sessionExpires: expires,
    sessionToken: transferSessionSignature(scope, key, total, expires),
  };
}

function safeTokenEquals(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a || a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

function validateTransferSession(payload, scope, key, total) {
  const expires = Number(payload.sessionExpires);
  if (!key || !Number.isInteger(total) || total <= 0 || !Number.isFinite(expires)) {
    throw new Error('La sesión de transferencia no es válida.');
  }
  if (expires < Date.now()) throw new Error('La sesión de transferencia expiró. Inicia nuevamente.');
  const expected = transferSessionSignature(scope, key, total, expires);
  if (!safeTokenEquals(payload.sessionToken, expected)) {
    throw new Error('La sesión de transferencia no está autorizada.');
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

function driveFetch(path, options) {
  const next = options || {};
  next.headers = Object.assign({}, next.headers || {}, {
    Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
  });
  next.muteHttpExceptions = true;
  const response = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/' + path, next);
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    let detail = '';
    try {
      const parsed = JSON.parse(response.getContentText() || '{}');
      detail = parsed.error && parsed.error.message ? ': ' + parsed.error.message : '';
    } catch (error) {
      detail = '';
    }
    throw new Error('Google Drive API respondió ' + status + detail);
  }
  return response;
}

function driveJson(path, options) {
  return JSON.parse(driveFetch(path, options).getContentText() || '{}');
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function getRootFolderId() {
  const properties = PropertiesService.getScriptProperties();
  const configuredId = properties.getProperty('DRIVE_FOLDER_ID');
  if (configuredId) return configuredId;

  const name = 'Chaide Biblioteca Digital';
  const query = encodeURIComponent(
    "name='" + escapeDriveQuery(name) + "' and mimeType='application/vnd.google-apps.folder' and trashed=false"
  );
  const found = driveJson('files?q=' + query + '&fields=files(id)&pageSize=10');
  let folderId = found.files && found.files.length ? found.files[0].id : '';
  if (!folderId) {
    const created = driveJson('files?fields=id', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ name: name, mimeType: 'application/vnd.google-apps.folder' }),
    });
    folderId = created.id;
  }
  properties.setProperty('DRIVE_FOLDER_ID', folderId);
  return folderId;
}

function getSubfolderId(kind) {
  const allowed = ['catalogs', 'covers', 'banners', 'category-icons'];
  if (allowed.indexOf(kind) === -1) throw new Error('Tipo de archivo no permitido.');
  const rootId = getRootFolderId();
  const query = encodeURIComponent(
    "'" + rootId + "' in parents and name='" + escapeDriveQuery(kind) +
    "' and mimeType='application/vnd.google-apps.folder' and trashed=false"
  );
  const found = driveJson('files?q=' + query + '&fields=files(id)&pageSize=10');
  if (found.files && found.files.length) return found.files[0].id;
  const created = driveJson('files?fields=id', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      name: kind,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootId],
    }),
  });
  return created.id;
}

function setDriveFilePublic(fileId) {
  const response = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '/permissions',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      payload: JSON.stringify({ type: 'anyone', role: 'reader' }),
      muteHttpExceptions: true,
    },
  );
  const status = response.getResponseCode();
  if (status !== 200 && status !== 201 && status !== 400) {
    throw new Error('Drive no pudo compartir el archivo.');
  }
}

function updateDriveDescription(fileId, description) {
  driveFetch('files/' + encodeURIComponent(fileId), {
    method: 'patch',
    contentType: 'application/json',
    payload: JSON.stringify({ description: description }),
  });
}

function uploadFile(payload, admin) {
  const kind = String(payload.kind || '');
  const fileName = sanitizeFileName(payload.fileName || ('archivo-' + Date.now()));
  const mimeType = String(payload.mimeType || 'application/octet-stream');
  const bytes = Utilities.base64Decode(String(payload.base64 || ''));
  const isPdf = kind === 'catalogs';
  const maxBytes = 12 * 1024 * 1024;

  if (!bytes.length) throw new Error('El archivo está vacío.');
  if (!isPdf && bytes.length > maxBytes) throw new Error('La imagen supera el límite permitido.');
  if (isPdf && mimeType !== 'application/pdf') throw new Error('Solo se permiten PDF.');
  if (!isPdf && mimeType.indexOf('image/') !== 0) throw new Error('Solo se permiten imágenes.');

  const uploadUrl = startResumableDriveUpload(fileName, mimeType, bytes.length, getSubfolderId(kind), '');
  const uploaded = UrlFetchApp.fetch(uploadUrl, {
    method: 'put',
    contentType: mimeType,
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'Content-Range': 'bytes 0-' + (bytes.length - 1) + '/' + bytes.length,
    },
    payload: bytes,
    muteHttpExceptions: true,
  });
  if (uploaded.getResponseCode() !== 200 && uploaded.getResponseCode() !== 201) {
    throw new Error('Drive no pudo completar la subida.');
  }
  const id = JSON.parse(uploaded.getContentText() || '{}').id;
  if (!id) throw new Error('Drive no devolvió el archivo final.');
  setDriveFilePublic(id);
  updateDriveDescription(id, 'Subido por ' + admin.email + ' · App v' + String(payload.appVersion || '?'));
  if (isPdf) clearCatalogInventoryCache();
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
  const uploadKey = sanitizeUploadKey(payload.uploadKey || Utilities.getUuid());
  const isPdf = kind === 'catalogs';
  const maxBytes = 12 * 1024 * 1024;
  if (!Number.isInteger(size) || size <= 0) throw new Error('El archivo está vacío.');
  if (!isPdf && size > maxBytes) throw new Error('La imagen supera el límite permitido.');
  if (isPdf && mimeType !== 'application/pdf') throw new Error('Solo se permiten PDF.');
  if (!isPdf && mimeType.indexOf('image/') !== 0) throw new Error('Solo se permiten imágenes.');

  const uploadUrl = startResumableDriveUpload(fileName, mimeType, size, getSubfolderId(kind), uploadKey);
  const transferSession = createTransferSession('upload', uploadUrl, size);
  return {
    ok: true,
    uploadUrl: uploadUrl,
    chunkSize: 4 * 1024 * 1024,
    fileName: fileName,
    mimeType: mimeType,
    size: size,
    uploadKey: uploadKey,
    sessionToken: transferSession.sessionToken,
    sessionExpires: transferSession.sessionExpires,
  };
}

function startResumableDriveUpload(fileName, mimeType, size, parentId, uploadKey) {
  const metadata = {
    name: fileName,
    mimeType: mimeType,
    parents: [parentId],
  };
  if (uploadKey) metadata.appProperties = { chaideUploadKey: uploadKey };
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
      payload: JSON.stringify(metadata),
      muteHttpExceptions: true,
    },
  );
  if (response.getResponseCode() !== 200) {
    throw new Error('Drive no pudo iniciar la subida por bloques.');
  }
  const headers = response.getHeaders();
  const uploadUrl = headers.Location || headers.location;
  if (!uploadUrl) throw new Error('Drive no devolvió una sesión de subida.');
  return uploadUrl;
}

function finishResumableUpload(data, mimeType, admin) {
  if (!data || !data.id) throw new Error('Drive no devolvió el archivo final.');
  setDriveFilePublic(data.id);
  updateDriveDescription(
    data.id,
    admin && admin.email
      ? 'Subido por ' + admin.email + ' · subida por bloques'
      : 'Subido desde el panel administrativo · subida por bloques',
  );
  const isPdf = mimeType === 'application/pdf';
  const checksumFile = driveJson(
    'files/' + encodeURIComponent(data.id) + '?fields=' + encodeURIComponent('md5Checksum')
  );
  if (isPdf) clearCatalogInventoryCache();
  return {
    ok: true,
    complete: true,
    fileId: data.id,
    driveUrl: 'https://drive.google.com/file/d/' + data.id + '/view',
    previewUrl: 'https://drive.google.com/file/d/' + data.id + '/preview',
    downloadUrl: 'https://drive.google.com/uc?export=download&id=' + data.id,
    thumbnailUrl: isPdf ? '' : 'https://drive.google.com/thumbnail?id=' + data.id + '&sz=w1600',
    md5Checksum: checksumFile.md5Checksum || '',
  };
}

function findCompletedUpload(uploadKey) {
  if (!uploadKey) return null;
  const query = encodeURIComponent(
    "appProperties has { key='chaideUploadKey' and value='" + escapeDriveQuery(uploadKey) + "' } and trashed=false"
  );
  const found = driveJson('files?q=' + query + '&fields=files(id,mimeType)&pageSize=2').files || [];
  return found.length ? found[0] : null;
}

function uploadStatus(payload, admin) {
  const uploadUrl = String(payload.uploadUrl || '');
  const uploadKey = sanitizeUploadKey(payload.uploadKey || '');
  const total = Number(payload.total);
  const mimeType = String(payload.mimeType || 'application/octet-stream');
  if (uploadUrl.indexOf('https://www.googleapis.com/upload/drive/v3/files') !== 0) {
    throw new Error('La sesión de subida no es válida.');
  }
  if (!Number.isInteger(total) || total <= 0) throw new Error('El tamaño de subida no es válido.');

  const completed = findCompletedUpload(uploadKey);
  if (completed) return finishResumableUpload(completed, completed.mimeType || mimeType, admin);

  const response = UrlFetchApp.fetch(uploadUrl, {
    method: 'put',
    contentType: mimeType,
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'Content-Range': 'bytes */' + total,
    },
    payload: '',
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  if (status === 200 || status === 201) {
    return finishResumableUpload(JSON.parse(response.getContentText() || '{}'), mimeType, admin);
  }
  if (status === 308) {
    const headers = response.getHeaders();
    const range = String(headers.Range || headers.range || '');
    const match = range.match(/bytes=0-(\d+)/i);
    return { ok: true, complete: false, nextOffset: match ? Number(match[1]) + 1 : 0 };
  }
  if (status === 404 || status === 410) throw new Error('La sesión de subida expiró. Inicia nuevamente la publicación.');
  throw new Error('Drive no pudo comprobar el avance de la subida.');
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
  if (!bytes.length || bytes.length > 4 * 1024 * 1024) throw new Error('Bloque de subida inválido.');
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

  return finishResumableUpload(JSON.parse(response.getContentText() || '{}'), mimeType, admin);
}

function deleteFile(payload) {
  const fileId = String(payload.fileId || '');
  if (!fileId) throw new Error('Falta fileId.');
  try {
    getManagedFile(fileId);
  } catch (error) {
    // A previous retry may already have completed the deletion even if its
    // response was lost. Treat a missing file as a successful final state.
    if (String(error && error.message || error).indexOf('respondió 404') !== -1) {
      clearCatalogInventoryCache();
      return { ok: true, fileId: fileId, alreadyDeleted: true };
    }
    throw error;
  }
  permanentlyDeleteManagedFile(fileId);
  clearCatalogInventoryCache();
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
  if (status === 204 || status === 404) return;

  // Files manually added to a shared folder can be editable by the account
  // running this bridge without being owned by it. Drive rejects permanent
  // deletion for those files, but still allows moving them to trash. The
  // inventory already excludes trashed files, so this is the correct final
  // state and prevents an impossible-to-clear synchronization row.
  const trashResponse = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) +
      '?supportsAllDrives=true&fields=id,trashed',
    {
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify({ trashed: true }),
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    }
  );
  const trashStatus = trashResponse.getResponseCode();
  if (trashStatus !== 200 && trashStatus !== 404) {
    throw new Error(
      'Drive no pudo eliminar ni enviar a la papelera el respaldo (HTTP ' +
      status + '/' + trashStatus + ').'
    );
  }
}

function downloadFile(payload) {
  const fileId = String(payload.fileId || '');
  if (!fileId) throw new Error('Falta fileId.');
  const file = getManagedFile(fileId);
  const response = driveFetch('files/' + encodeURIComponent(fileId) + '?alt=media');
  const bytes = response.getBlob().getBytes();
  if (!bytes.length) throw new Error('El respaldo está vacío.');
  return {
    ok: true,
    fileId: fileId,
    fileName: file.name,
    mimeType: file.mimeType || 'application/pdf',
    size: bytes.length,
    base64: Utilities.base64Encode(bytes),
  };
}

function downloadInfo(payload) {
  const fileId = String(payload.fileId || '');
  if (!fileId) throw new Error('Falta fileId.');
  const file = getManagedFile(fileId);
  const size = Number(file.size || 0);
  const chunkSize = 2 * 1024 * 1024;
  if (!size) throw new Error('El respaldo está vacío.');
  const transferSession = createTransferSession('download', fileId, size);
  return {
    ok: true,
    fileId: fileId,
    fileName: file.name,
    mimeType: file.mimeType || 'application/pdf',
    size: size,
    chunkSize: chunkSize,
    chunkCount: Math.ceil(size / chunkSize),
    sessionToken: transferSession.sessionToken,
    sessionExpires: transferSession.sessionExpires,
  };
}

function downloadChunk(payload) {
  const fileId = String(payload.fileId || '');
  const index = Number(payload.index);
  if (!fileId) throw new Error('Falta fileId.');
  if (!Number.isInteger(index) || index < 0) throw new Error('Índice de bloque inválido.');
  const chunkSize = 2 * 1024 * 1024;
  const from = index * chunkSize;
  const size = Number(payload.total || 0);
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
  const folderId = getSubfolderId('catalogs');
  const query = encodeURIComponent(
    "'" + folderId + "' in parents and name='" + escapeDriveQuery(fileName) + "' and trashed=false"
  );
  const matches = driveJson('files?q=' + query + '&fields=files(id)&pageSize=100').files || [];
  let deleted = 0;
  matches.forEach(function (file) {
    permanentlyDeleteManagedFile(file.id);
    deleted++;
  });
  if (deleted) clearCatalogInventoryCache();
  return { ok: true, fileName: fileName, deleted: deleted };
}

function clearCatalogInventoryCache() {
  CacheService.getScriptCache().remove('catalog-pdf-inventory-v1');
}

function listCatalogs() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('catalog-pdf-inventory-v1');
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.ok && Array.isArray(parsed.files)) return parsed;
    } catch (error) {
      // Rebuild the inventory if a stale cache entry cannot be decoded.
    }
  }
  const rootId = getRootFolderId();
  const catalogsId = getSubfolderId('catalogs');
  const seen = {};
  const files = [];

  // Files added manually may be placed either in the shared root folder or
  // in the catalogs subfolder used by automatic uploads.
  appendPdfFiles(listDriveChildren(rootId), files, seen);
  appendPdfFiles(listDriveChildren(catalogsId), files, seen);

  files.sort(function (left, right) {
    return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
  });
  const result = { ok: true, files: files };
  // Drive can be slow on a cold execution. A short cache makes subsequent
  // admin checks immediate while still detecting manually uploaded PDFs soon.
  try {
    cache.put('catalog-pdf-inventory-v1', JSON.stringify(result), 60);
  } catch (error) {
    // Large inventories can exceed CacheService's per-entry size. Returning
    // the complete live result is more important than caching it.
  }
  return result;
}

function listDriveChildren(folderId) {
  const query = encodeURIComponent("'" + folderId + "' in parents and trashed=false");
  const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,md5Checksum)');
  let pageToken = '';
  let files = [];
  do {
    const suffix = pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '';
    const page = driveJson('files?q=' + query + '&fields=' + fields + '&pageSize=250' + suffix);
    files = files.concat(page.files || []);
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return files;
}

function appendPdfFiles(iterator, output, seen) {
  iterator.forEach(function (file) {
    const id = file.id;
    if (seen[id]) return;
    const name = file.name;
    const mimeType = file.mimeType || '';
    if (mimeType !== 'application/pdf' && !/\.pdf$/i.test(name)) return;
    seen[id] = true;
    output.push({
      fileId: id,
      fileName: name,
      mimeType: mimeType || 'application/pdf',
      size: Number(file.size || 0),
      createdAt: file.createdTime || '',
      updatedAt: file.modifiedTime || '',
      driveUrl: 'https://drive.google.com/file/d/' + id + '/view',
      previewUrl: 'https://drive.google.com/file/d/' + id + '/preview',
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + id,
      md5Checksum: file.md5Checksum || '',
    });
  });
}

function getManagedFile(fileId) {
  const fields = encodeURIComponent('id,name,mimeType,size,parents,trashed');
  const file = driveJson('files/' + encodeURIComponent(fileId) + '?fields=' + fields);
  if (file.trashed) throw new Error('El archivo está en la papelera.');
  const rootId = getRootFolderId();
  const parents = file.parents || [];
  if (parents.indexOf(rootId) !== -1) return file;
  for (let index = 0; index < parents.length; index++) {
    const parent = driveJson(
      'files/' + encodeURIComponent(parents[index]) + '?fields=' + encodeURIComponent('id,parents,trashed')
    );
    if (!parent.trashed && (parent.parents || []).indexOf(rootId) !== -1) return file;
  }
  throw new Error('El archivo no pertenece al respaldo administrado.');
}

function sanitizeFileName(value) {
  return String(value).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 180);
}

function sanitizeUploadKey(value) {
  return String(value).replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 80);
}

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
