/**
 * Dairy App — Google Apps Script for Automated Admin Google Drive Backups
 * 
 * Instructions:
 * 1. Open https://script.google.com on your Admin Google account.
 * 2. Click "New project".
 * 3. Replace all code in Code.gs with this code.
 * 4. Click "Deploy" -> "New deployment".
 * 5. Select type: "Web app".
 * 6. Set Description: "Dairy App Backup Webhook".
 * 7. Set "Execute as": "Me" (your Google account).
 * 8. Set "Who has access": "Anyone" (allows app to upload backups without Google login prompts).
 * 9. Click "Deploy", authorize access, and copy the Web App URL.
 * 10. Paste this URL in your Dairy App Super Admin Portal.
 */

const ROOT_FOLDER_NAME = 'DairyApp_Backups';

function getOrCreateFolder(parent, folderName) {
  const folders = parent.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return parent.createFolder(folderName);
}

function getRootBackupFolder() {
  return getOrCreateFolder(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
}

function sanitizeName(str) {
  if (!str) return 'Dairy';
  return str.replace(/[^a-zA-Z0-9_\u0900-\u097F-]/g, '_').slice(0, 50);
}

function doPost(e) {
  try {
    const json = JSON.parse(e.postData.contents);
    const action = json.action || 'upload';

    if (action === 'upload') {
      const supplierName = sanitizeName(json.supplierName || 'Dairy_Supplier');
      const supplierPhone = (json.supplierPhone || 'dairy').replace(/\D/g, '').slice(-10);
      const folderName = `${supplierName}_${supplierPhone}`;
      
      const rootFolder = getRootBackupFolder();
      const suppFolder = getOrCreateFolder(rootFolder, folderName);
      
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
      const fileName = json.fileName || `Backup_${supplierName}_${dateStr}.json`;
      
      const fileContent = typeof json.data === 'string' ? json.data : JSON.stringify(json.data, null, 2);
      const file = suppFolder.createFile(fileName, fileContent, MimeType.PLAIN_TEXT);
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        fileId: file.getId(),
        fileName: file.getName(),
        fileSize: file.getSize(),
        createdAt: now.toISOString(),
        url: file.getUrl(),
        message: `Successfully saved ${fileName} in Drive folder ${folderName}`
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: `Unknown action: ${action}`
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'ping';

    if (action === 'ping') {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        status: 'ready',
        message: 'Dairy App Google Drive Webhook is active and working!'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'list') {
      const rootFolder = getRootBackupFolder();
      const targetQuery = (e.parameter.query || '').toLowerCase().trim();
      const subfolders = rootFolder.getFolders();
      const results = [];

      while (subfolders.hasNext()) {
        const folder = subfolders.next();
        const fName = folder.getName();

        if (!targetQuery || fName.toLowerCase().includes(targetQuery)) {
          const files = folder.getFiles();
          const fileList = [];
          while (files.hasNext()) {
            const file = files.next();
            fileList.push({
              id: file.getId(),
              name: file.getName(),
              size: file.getSize(),
              date: file.getDateCreated().toISOString()
            });
          }
          // Sort newest file first
          fileList.sort((a, b) => new Date(b.date) - new Date(a.date));

          results.push({
            folderName: fName,
            files: fileList
          });
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        folders: results
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'get') {
      const fileId = e.parameter.fileId;
      if (!fileId) throw new Error('fileId parameter is required');
      
      const file = DriveApp.getFileById(fileId);
      const content = file.getBlob().getDataAsString('UTF-8');
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        fileName: file.getName(),
        data: JSON.parse(content)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: `Unknown action: ${action}`
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
