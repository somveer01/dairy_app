/**
 * Dairy App — Google Apps Script for Automated Admin Google Drive Backups
 * 
 * Includes:
 * 1. Webhook endpoints (doPost, doGet) for manual 1-Click backup & restore from Super Admin Portal.
 * 2. Automated 24-Hour Midnight Backup (autoBackupAllAtMidnight) with automatic retries on failure.
 * 
 * Setup Instructions:
 * 1. Open https://script.google.com on your Admin Google account.
 * 2. Replace all code in Code.gs with this file's code.
 * 3. Click "Save" (💾).
 * 4. To set up 24-Hour Auto-Backup at Midnight:
 *    a. In the left sidebar, click "Triggers" (⏰ clock icon).
 *    b. Click "+ Add Trigger" (bottom right).
 *    c. Function: "autoBackupAllAtMidnight".
 *    d. Event source: "Time-driven".
 *    e. Type of time based trigger: "Day timer".
 *    f. Time of day: "Midnight to 1am".
 *    g. Click "Save" and authorize Google permissions if prompted.
 */

const ROOT_FOLDER_NAME = 'DairyApp_Backups';
const FIREBASE_RTDB_URL = 'https://diaryapp-28278-default-rtdb.asia-southeast1.firebasedatabase.app';

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

function saveSupplierBackupFile(supplierName, supplierPhone, payloadData) {
  const cleanName = sanitizeName(supplierName || 'Dairy_Supplier');
  const cleanPhone = (supplierPhone || 'dairy').replace(/\D/g, '').slice(-10);
  const folderName = `${cleanName}_${cleanPhone}`;
  
  const rootFolder = getRootBackupFolder();
  const suppFolder = getOrCreateFolder(rootFolder, folderName);
  
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
  const fileName = `Backup_${cleanName}_${dateStr}.json`;
  
  const fileContent = typeof payloadData === 'string' ? payloadData : JSON.stringify(payloadData, null, 2);
  const file = suppFolder.createFile(fileName, fileContent, MimeType.PLAIN_TEXT);

  return {
    fileId: file.getId(),
    fileName: file.getName(),
    fileSize: file.getSize(),
    createdAt: now.toISOString(),
    url: file.getUrl(),
    folderName: folderName
  };
}

// -------------------------------------------------------------
// WEBHOOK HANDLER: Manual 1-Click Backups & Restores from Portal
// -------------------------------------------------------------
function doPost(e) {
  try {
    const json = JSON.parse(e.postData.contents);
    const action = json.action || 'upload';

    if (action === 'upload') {
      const supplierName = json.supplierName || 'Dairy_Supplier';
      const supplierPhone = json.supplierPhone || 'dairy';
      const result = saveSupplierBackupFile(supplierName, supplierPhone, json.data);

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        ...result,
        message: `Successfully saved ${result.fileName} in Drive folder ${result.folderName}`
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'trigger_all_backup') {
      const runResult = autoBackupAllAtMidnight();
      return ContentService.createTextOutput(JSON.stringify(runResult)).setMimeType(ContentService.MimeType.JSON);
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

// ------------------------------------------------------------------------------------
// AUTOMATED 24-HOUR MIDNIGHT BACKUP (WITH RETRY ON FAILURE)
// ------------------------------------------------------------------------------------
/**
 * Run automatically once every 24 hours at midnight.
 * Fetches all suppliers directly from Firebase RTDB and saves snapshots to Drive.
 * If any dairy fails, it retries up to 3 times with exponential pause.
 */
function autoBackupAllAtMidnight() {
  Logger.log('Starting automated 24-hour midnight backup for all dairies...');
  
  let allSuppliersData = null;
  const maxFetchRetries = 3;

  // Step 1: Fetch entire suppliers dataset from Firebase with retry
  for (let attempt = 1; attempt <= maxFetchRetries; attempt++) {
    try {
      const url = `${FIREBASE_RTDB_URL}/suppliers.json`;
      const response = UrlFetchApp.fetch(url, {
        method: 'get',
        muteHttpExceptions: true
      });

      if (response.getResponseCode() === 200) {
        allSuppliersData = JSON.parse(response.getContentText());
        if (allSuppliersData) {
          Logger.log(`Successfully fetched suppliers data on attempt ${attempt}.`);
          break;
        }
      } else {
        Logger.warn(`Fetch returned status ${response.getResponseCode()} on attempt ${attempt}.`);
      }
    } catch (e) {
      Logger.warn(`Fetch error on attempt ${attempt}: ${e}`);
    }

    if (attempt < maxFetchRetries) {
      Utilities.sleep(attempt * 5000); // Wait 5s, 10s before retry
    }
  }

  if (!allSuppliersData) {
    const errorMsg = 'Failed to fetch suppliers from Firebase RTDB after 3 attempts.';
    Logger.error(errorMsg);
    saveBackupStatusLog(false, 0, 0, [errorMsg]);
    return { success: false, message: errorMsg };
  }

  const supplierKeys = Object.keys(allSuppliersData);
  let successCount = 0;
  let failCount = 0;
  const errors = [];

  // Step 2: Loop through each supplier and create snapshot
  for (let i = 0; i < supplierKeys.length; i++) {
    const sKey = supplierKeys[i];
    const rawData = allSuppliersData[sKey];
    if (!rawData) continue;

    const profile = rawData.profile || {};
    const sName = profile.businessName || profile.name || 'Dairy';
    const sPhone = profile.phone || sKey.replace('supp_', '');

    let backedUp = false;
    let lastError = '';

    // Retry per dairy up to 3 times
    for (let retry = 1; retry <= 3; retry++) {
      try {
        const payload = {
          version: '2.0',
          backupType: 'auto_midnight_snapshot',
          exportedAt: new Date().toISOString(),
          supplier: {
            ...profile,
            id: sKey,
            phone: sPhone,
            name: sName
          },
          customers: rawData.customers ? (Array.isArray(rawData.customers) ? rawData.customers : Object.values(rawData.customers)) : [],
          milkEntries: rawData.milkEntries ? (Array.isArray(rawData.milkEntries) ? rawData.milkEntries : Object.values(rawData.milkEntries)) : [],
          payments: rawData.payments ? (Array.isArray(rawData.payments) ? rawData.payments : Object.values(rawData.payments)) : [],
          subSuppliers: rawData.subSuppliers ? (Array.isArray(rawData.subSuppliers) ? rawData.subSuppliers : Object.values(rawData.subSuppliers)) : [],
          milkInwardEntries: rawData.milkInwardEntries ? (Array.isArray(rawData.milkInwardEntries) ? rawData.milkInwardEntries : Object.values(rawData.milkInwardEntries)) : [],
          subSupplierPayments: rawData.subSupplierPayments ? (Array.isArray(rawData.subSupplierPayments) ? rawData.subSupplierPayments : Object.values(rawData.subSupplierPayments)) : []
        };

        saveSupplierBackupFile(sName, sPhone, payload);
        backedUp = true;
        break; // Success, no need to retry this dairy
      } catch (err) {
        lastError = err.toString();
        Logger.warn(`Retry ${retry}/3 failed for ${sName} (${sPhone}): ${lastError}`);
        if (retry < 3) {
          Utilities.sleep(3000 * retry); // Wait 3s, 6s
        }
      }
    }

    if (backedUp) {
      successCount++;
      Logger.log(`[${successCount}/${supplierKeys.length}] Saved backup for ${sName} (${sPhone})`);
    } else {
      failCount++;
      errors.push(`${sName} (${sPhone}): ${lastError}`);
      Logger.error(`Failed permanently for ${sName} (${sPhone}) after 3 attempts.`);
    }
  }

  // Step 3: Record execution log in Google Drive
  saveBackupStatusLog(failCount === 0, successCount, failCount, errors);

  Logger.log(`Midnight backup completed: ${successCount} succeeded, ${failCount} failed.`);
  return {
    success: failCount === 0,
    successCount,
    failCount,
    errors
  };
}

/**
 * Saves execution log file in Google Drive so Super Admin can inspect health.
 */
function saveBackupStatusLog(isSuccess, successCount, failCount, errors) {
  try {
    const rootFolder = getRootBackupFolder();
    const now = new Date();
    const logData = {
      lastRunAt: now.toISOString(),
      status: isSuccess ? 'SUCCESS' : 'PARTIAL_OR_FAILED',
      successCount: successCount,
      failCount: failCount,
      errors: errors
    };

    const fileName = 'AutoBackup_Latest_Status.json';
    const files = rootFolder.getFilesByName(fileName);
    if (files.hasNext()) {
      files.next().setContent(JSON.stringify(logData, null, 2));
    } else {
      rootFolder.createFile(fileName, JSON.stringify(logData, null, 2), MimeType.PLAIN_TEXT);
    }
  } catch (e) {
    Logger.warn('Could not save status log file: ' + e);
  }
}
