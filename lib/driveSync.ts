import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";

type DriveSyncOptions = {
  baseStorage: string;
  getDb: () => any;
  saveDb: (data: any) => void;
  ensureSearchIndex: (document: any) => Promise<any>;
};

type DriveCatalogFile = {
  id: string;
  name: string;
  description?: string | null;
  modifiedTime?: string | null;
  md5Checksum?: string | null;
  size?: string | null;
  category: string;
};

function normalizeName(value: string) {
  return value
    .replace(/\.pdf$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function slugify(value: string) {
  return normalizeName(value).replace(/\s+/g, "-") || "catalogos";
}

function parseServiceAccount(raw: string) {
  const credentials = JSON.parse(raw);
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("GOOGLE_SA_JSON no contiene client_email y private_key");
  }
  return credentials;
}

async function listDriveCatalogs(drive: any, rootFolderId: string) {
  const catalogs: DriveCatalogFile[] = [];
  const queue = [{ id: rootFolderId, category: "Catalogos" }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const folder = queue.shift()!;
    if (visited.has(folder.id)) continue;
    visited.add(folder.id);

    let pageToken: string | undefined;
    do {
      const response = await drive.files.list({
        q: `'${folder.id.replace(/'/g, "\\'")}' in parents and trashed = false`,
        fields: "nextPageToken,files(id,name,mimeType,description,modifiedTime,md5Checksum,size)",
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      for (const file of response.data.files || []) {
        if (!file.id || !file.name) continue;
        if (file.mimeType === "application/vnd.google-apps.folder") {
          queue.push({ id: file.id, category: file.name });
          continue;
        }
        if (file.mimeType !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
          continue;
        }
        catalogs.push({
          id: file.id,
          name: file.name,
          description: file.description,
          modifiedTime: file.modifiedTime,
          md5Checksum: file.md5Checksum,
          size: file.size,
          category: folder.category,
        });
      }
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
  }

  return catalogs;
}

async function downloadDriveFile(drive: any, fileId: string, destination: string) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporaryPath = `${destination}.part`;
  const response = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" },
  );

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(temporaryPath);
    response.data
      .on("error", reject)
      .pipe(output)
      .on("error", reject)
      .on("finish", resolve);
  });

  const header = Buffer.alloc(4);
  const handle = await fs.promises.open(temporaryPath, "r");
  await handle.read(header, 0, 4, 0);
  await handle.close();
  if (header.toString() !== "%PDF") {
    await fs.promises.unlink(temporaryPath).catch(() => undefined);
    throw new Error(`Drive file ${fileId} no es un PDF valido`);
  }

  await fs.promises.rm(destination, { force: true });
  await fs.promises.rename(temporaryPath, destination);
}

function ensureDriveCategory(db: any, categoryName: string) {
  db.categories ||= [];
  const normalized = normalizeName(categoryName);
  if (db.categories.some((item: any) => normalizeName(item.name || "") === normalized)) {
    return;
  }

  const now = new Date().toISOString();
  const maxOrder = db.categories.reduce(
    (max: number, item: any) => Math.max(max, Number(item.order) || 0),
    0,
  );
  db.categories.push({
    id: `drive-${slugify(categoryName)}`,
    name: categoryName,
    slug: slugify(categoryName),
    description: `Catalogos sincronizados desde Google Drive: ${categoryName}.`,
    icon: "Package",
    imageUrl: "",
    order: maxOrder + 10,
    active: true,
    keywords: [normalized],
    createdAt: now,
    updatedAt: now,
  });
}

export function startDriveCatalogSync(options: DriveSyncOptions) {
  const rawCredentials = process.env.GOOGLE_SA_JSON?.trim();
  const rootFolderId = process.env.DRIVE_CATALOG_FOLDER_ID?.trim();
  if (!rawCredentials || !rootFolderId) {
    console.log("[DRIVE SYNC] Disabled: GOOGLE_SA_JSON or DRIVE_CATALOG_FOLDER_ID is missing.");
    return;
  }

  const intervalMinutes = Math.max(
    1,
    Number(process.env.DRIVE_SYNC_INTERVAL_MINUTES) || 10,
  );
  let running = false;

  const sync = async () => {
    if (running) return;
    running = true;
    try {
      const credentials = parseServiceAccount(rawCredentials);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/drive.readonly"],
      });
      const drive = google.drive({ version: "v3", auth });
      const files = await listDriveCatalogs(drive, rootFolderId);
      const db = options.getDb();
      db.documents ||= [];
      const activeDriveIds = new Set(files.map((file) => file.id));
      const indexesToRefresh: any[] = [];

      for (const file of files) {
        const normalizedTitle = normalizeName(file.name);
        let document = db.documents.find(
          (item: any) => item.driveFileId === file.id || item.id === `drive-${file.id}`,
        );
        if (!document) {
          document = db.documents.find(
            (item: any) =>
              !item.driveFileId &&
              !item.isDeleted &&
              normalizeName(item.title || "") === normalizedTitle,
          );
        }

        const documentId = document?.id || `drive-${file.id}`;
        const currentRelativePath =
          typeof document?.fileUrl === "string" &&
          document.fileUrl.startsWith("/storage/pdfs/")
            ? document.fileUrl.slice("/storage/".length)
            : `pdfs/${documentId}.pdf`;
        const destination = path.join(options.baseStorage, currentRelativePath);
        const changed =
          !fs.existsSync(destination) ||
          document?.driveModifiedTime !== file.modifiedTime ||
          (file.md5Checksum && document?.driveMd5Checksum !== file.md5Checksum);

        if (changed) {
          await downloadDriveFile(drive, file.id, destination);
        }

        const now = new Date().toISOString();
        const nextDocument = {
          ...(document || {}),
          id: documentId,
          title: document?.title || file.name.replace(/\.pdf$/i, ""),
          description: document?.description || file.description || "",
          category: file.category,
          pageCount: document?.pageCount || 1,
          coverUrl:
            document?.coverUrl ||
            "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop",
          fileUrl: `/storage/${currentRelativePath.replace(/\\/g, "/")}`,
          tags: document?.tags || [],
          status: "ready",
          sourceType: "drive",
          visibility: document?.visibility || "public",
          fileSize: Number(file.size) || fs.statSync(destination).size,
          isActive: true,
          isDeleted: false,
          driveFileId: file.id,
          driveModifiedTime: file.modifiedTime || null,
          driveMd5Checksum: file.md5Checksum || null,
          updatedAt: changed ? now : document?.updatedAt || now,
        };

        if (document) {
          Object.assign(document, nextDocument);
        } else {
          db.documents.unshift(nextDocument);
          document = nextDocument;
        }
        ensureDriveCategory(db, file.category);
        if (changed) indexesToRefresh.push(document);
      }

      for (const document of db.documents) {
        if (
          document.driveFileId &&
          document.sourceType === "drive" &&
          !activeDriveIds.has(document.driveFileId)
        ) {
          document.isDeleted = true;
          document.isActive = false;
          document.updatedAt = new Date().toISOString();
        }
      }

      options.saveDb(db);
      console.log(`[DRIVE SYNC] ${files.length} catalogos sincronizados.`);
      for (const document of indexesToRefresh) {
        options.ensureSearchIndex(document).catch((error) => {
          console.warn(`[DRIVE SYNC] No se pudo indexar ${document.id}:`, error?.message || error);
        });
      }
    } catch (error: any) {
      console.error("[DRIVE SYNC] Error:", error?.message || error);
    } finally {
      running = false;
    }
  };

  setTimeout(() => sync(), 3000);
  setInterval(() => sync(), intervalMinutes * 60 * 1000);
  console.log(`[DRIVE SYNC] Enabled every ${intervalMinutes} minute(s).`);
}
