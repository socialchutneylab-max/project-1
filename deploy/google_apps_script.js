/**
 * Google Apps Script for The Social Chutney Co. Task Sheet
 * 
 * Instructions:
 * 1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1VWhguGAkq0kMkodHSLzrfjjfCg-Hb_3zcTE-U0EQvDE/edit
 * 2. In the top menu, go to: Extensions > Apps Script
 * 3. Delete any code in the editor, paste this entire script, and click the Save icon (💾)
 * 4. Click the blue "Deploy" button (top right) > "New deployment"
 * 5. Select type: "Web app" (click gear icon next to 'Select type' if needed)
 * 6. Set Description: "Task Sync Webhook"
 * 7. Set "Execute as": "Me"
 * 8. Set "Who has access": "Anyone" (important so the app can sync tasks)
 * 9. Click "Deploy", authorize permissions when prompted, and copy the Web App URL (ends in /exec)
 * 10. Paste the Web App URL into the app's Task Sheet Settings!
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No payload received" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var count = 0;

    // Sheet 1: Founder Task Management
    if (data.founder_tasks && data.founder_tasks.length > 0) {
      var fHeaders = data.founder_headers || [
        "Date", "Task Name", "Task Category", "Objective / Brief", "Priority",
        "Est. Completion Time (hrs)", "Current Status", "Delay Reason",
        "Review Notes / Next Action", "Output Link"
      ];
      count += upsertTasks(ss, "Founder Task Management", fHeaders, data.founder_tasks);
    }

    // Sheet 2: Designer Task Management
    if (data.designer_tasks && data.designer_tasks.length > 0) {
      var dHeaders = data.designer_headers || [
        "Date", "Task Name", "Client / Work Type", "Objective / Brief", "Priority",
        "Manager Deadline (hrs)", "Designer Committed Time (hrs)", "Current Status",
        "Delay Reason", "Output Link", "Review Notes / Changes"
      ];
      count += upsertTasks(ss, "Designer Task Management", dHeaders, data.designer_tasks);
    }

    // Single sheet generic payload support
    if (data.sheet_name && data.rows && data.rows.length > 0) {
      count += upsertTasks(ss, data.sheet_name, data.headers || [], data.rows);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Synced " + count + " task(s) successfully to Google Sheet",
      count: count
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    sheet_name: SpreadsheetApp.getActiveSpreadsheet().getName()
  })).setMimeType(ContentService.MimeType.JSON);
}

function upsertTasks(ss, sheetName, headers, rows) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  // If sheet is empty, create headers
  if (sheet.getLastRow() === 0 && headers && headers.length > 0) {
    sheet.appendRow(headers);
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#E6F4EA"); // soft emerald
    sheet.setFrozenRows(1);
  }

  var lastRow = sheet.getLastRow();
  var numCols = headers.length;
  var existingData = [];
  if (lastRow > 1) {
    existingData = sheet.getRange(2, 1, lastRow - 1, Math.min(2, numCols)).getValues();
  }

  var updatedCount = 0;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    while (row.length < numCols) row.push(""); // pad row if needed
    var taskDate = String(row[0]).trim();
    var taskName = String(row[1]).trim();
    var updated = false;

    // Check if task with same Date & Name already exists
    for (var j = 0; j < existingData.length; j++) {
      var existingDate = String(existingData[j][0]).trim();
      var existingName = String(existingData[j][1]).trim();
      if (existingDate === taskDate && existingName === taskName) {
        var rowIndex = j + 2;
        sheet.getRange(rowIndex, 1, 1, numCols).setValues([row]);
        updated = true;
        updatedCount++;
        break;
      }
    }

    if (!updated) {
      sheet.appendRow(row);
      updatedCount++;
    }
  }

  // Auto-resize columns for readability
  for (var c = 1; c <= Math.min(numCols, 6); c++) {
    sheet.autoResizeColumn(c);
  }

  return updatedCount;
}
