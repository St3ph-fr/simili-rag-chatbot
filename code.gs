// Properties
const GEMINI_KEY = "YOUR_GEMINI_API_KEY"; // IMPORTANT: Replace with your actual Gemini API Key

// To allow anyone with a Google account, add "*" to this array.
const AUTHORIZED_USERS = ["*"]; // CONFIGURE AUTHORIZED USERS (e.g., ["*", "me@example.com"]) 

// ID of the Google Drive folder whose files (Docs, Sheets, TXT at root) will be used for context.
const DRIVE_FOLDER_ID_FOR_CONTEXT = "YOUR_DRIVE_FOLDER"; // IMPORTANT: Replace with your Drive Folder ID

// For file caching
const CACHE_EXPIRATION_SECONDS = 30 * 60; // 30 minutes (Apps Script max is 6 hours)

/**
 * Serves the HTML interface for the web app.
 */
function doGet(e) {
  if (!isUserAuthorized()) {
    return HtmlService.createHtmlOutput('Accès non autorisé.');
  }
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('LLM Chat Interface')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Checks if the current user is authorized.
 */
function isUserAuthorized() {
  const effectiveUserEmail = Session.getEffectiveUser().getEmail();
  const activeUserEmail = Session.getActiveUser().getEmail();

  // If running in the editor, access is granted.
  if (!effectiveUserEmail && activeUserEmail) {
    Logger.log("Running in editor mode (user: " + activeUserEmail + "). Granting access.");
    return true;
  }
  Logger.log("Checking authorization for web app user: " + effectiveUserEmail);
  if (!effectiveUserEmail) {
    Logger.log("User is anonymous. Access denied.");
    return false;
  }
  if (AUTHORIZED_USERS.includes("*")) {
    Logger.log("Authorization granted: '*' is present for " + effectiveUserEmail);
    return true;
  }
  if (AUTHORIZED_USERS.length === 0) {
    Logger.log("No authorized users configured (and no '*'). Denying access for " + effectiveUserEmail);
    return false;
  }
  const isAuthorized = AUTHORIZED_USERS.includes(effectiveUserEmail);
  Logger.log(`User ${effectiveUserEmail} authorization status (specific list): ${isAuthorized}`);
  return isAuthorized;
}

/**
 * Includes the content of another HTML file in the template.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// --- File Caching Functions ---
function getFileDataFromCache(fileId) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `file_${fileId}`;
  const cachedValue = cache.get(cacheKey);
  if (cachedValue) {
    Logger.log(`Cache HIT for fileId: ${fileId}`);
    // Refresh the cache entry to reset its expiration
    cache.put(cacheKey, cachedValue, CACHE_EXPIRATION_SECONDS); 
    return JSON.parse(cachedValue);
  }
  Logger.log(`Cache MISS for fileId: ${fileId}`);
  return null;
}

function putFileDataToCache(fileId, fileData) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `file_${fileId}`;
  cache.put(cacheKey, JSON.stringify(fileData), CACHE_EXPIRATION_SECONDS);
  Logger.log(`Cached data for fileId: ${fileId}`);
}

/**
 * REWORKED: Fetches and caches the TEXT content of a file from Google Drive.
 * It no longer deals with base64 encoding.
 * @param {string} fileId The ID of the file in Google Drive.
 * @return {object} An object with { fileName, fileContent, error }.
 */
function getAndCacheFileContent(fileId) {
  // First, check the cache.
  let fileData = getFileDataFromCache(fileId);
  if (fileData) {
    return fileData; // Return cached data if available.
  }

  Logger.log(`Fetching file from Drive to extract text: ${fileId}`);
  try {
    const file = DriveApp.getFileById(fileId);
    const mimeType = file.getMimeType();
    const fileName = file.getName();

    let fileContent = null;
    let error = null;

    if (mimeType === MimeType.GOOGLE_DOCS) {
      try {
        // Export Google Doc as plain text for cleaner context
        const url = `https://docs.google.com/feeds/download/documents/export/Export?id=${fileId}&exportFormat=txt`;
        const response = UrlFetchApp.fetch(url, {
          method: "GET",
          headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() },
          'muteHttpExceptions': true
        });
        if (response.getResponseCode() == 200) {
           fileContent = response.getContentText();
        } else {
           throw new Error(`Failed to export Google Doc. Status: ${response.getResponseCode()}`);
        }
      } catch (e) {
        error = "Failed to retrieve Google Doc content as text.";
        Logger.log(`Error fetching Google Doc ${fileId} as text: ${e.toString()}`);
      }
    } else if (mimeType === MimeType.GOOGLE_SHEETS) {
      try {
        // Export Google Sheet as CSV
        const url = 'https://docs.google.com/spreadsheets/export?id=' + fileId + '&exportFormat=csv';
        const response = UrlFetchApp.fetch(url, {
          method: "GET",
          headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() },
          'muteHttpExceptions': true
        });
        if (response.getResponseCode() == 200) {
          fileContent = response.getContentText(); // The raw CSV text content
        } else {
           throw new Error(`Failed to export Google Sheet. Status: ${response.getResponseCode()}`);
        }
      } catch (e) {
        error = "Failed to retrieve Google Sheet content as CSV.";
        Logger.log(`Error fetching Google Sheet ${fileId} as CSV: ${e.toString()}`);
      }
    } else if (mimeType === MimeType.PLAIN_TEXT || fileName.toLowerCase().endsWith('.txt')) {
      fileContent = file.getBlob().getDataAsString();
    } else {
      // This case should ideally not be hit due to filtering in getFileIdsFromFolderForContext
      error = `Unsupported file type for text extraction: ${mimeType}`;
      Logger.log(`${error} for file ${fileName} (ID: ${fileId}).`);
    }

    fileData = { fileName, fileContent, error };
    putFileDataToCache(fileId, fileData); // Cache the result, including errors.
    return fileData;

  } catch (e) {
    const errorMsg = `Failed to access file: ${e.message}`;
    Logger.log(`Error accessing or processing fileId ${fileId}: ${e.toString()}`);
    fileData = { fileName: `ErrorFile_${fileId}`, fileContent: null, error: errorMsg };
    putFileDataToCache(fileId, fileData); // Cache errors to prevent repeated failed attempts.
    return fileData;
  }
}


/**
 * Lists file IDs from the specified Google Drive folder, filtering for Sheets, Docs, and TXT files.
 * Only checks files at the root of the folder.
 * @return {Array<string>} An array of file IDs eligible for context.
 */
function getFileIdsFromFolderForContext() {
  if (!DRIVE_FOLDER_ID_FOR_CONTEXT || DRIVE_FOLDER_ID_FOR_CONTEXT === "YOUR_GOOGLE_DRIVE_FOLDER_ID") {
    Logger.log("DRIVE_FOLDER_ID_FOR_CONTEXT is not set. No files will be fetched.");
    return [];
  }

  let eligibleFileIds = [];
  try {
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID_FOR_CONTEXT);
    const files = folder.getFiles();

    const allowedMimeTypes = [
      MimeType.GOOGLE_DOCS,
      MimeType.PLAIN_TEXT,
      MimeType.GOOGLE_SHEETS
    ];

    while (files.hasNext()) {
      const file = files.next();
      const mimeType = file.getMimeType();
      const fileName = file.getName();
      // Check for allowed MIME types or if it's a txt file (as MIME can sometimes be generic)
      if (allowedMimeTypes.includes(mimeType) || fileName.toLowerCase().endsWith(".txt")) {
        eligibleFileIds.push(file.getId());
        Logger.log(`Eligible for context: "${fileName}" (ID: ${file.getId()}, Type: ${mimeType})`);
      } else {
        Logger.log(`Skipping (not Sheet, Doc, or TXT): "${fileName}" (ID: ${file.getId()}, Type: ${mimeType})`);
      }
    }
    Logger.log(`Found ${eligibleFileIds.length} eligible files in folder ${DRIVE_FOLDER_ID_FOR_CONTEXT}.`);
  } catch (e) {
    Logger.log(`Error accessing folder or listing files for context (Folder ID: ${DRIVE_FOLDER_ID_FOR_CONTEXT}): ${e.toString()}`);
    return []; // Return empty on error
  }
  return eligibleFileIds;
}


/**
 * REWORKED: Main function to interact with the Gemini LLM for chat.
 * It now combines file content as text into a single context block.
 */
function callGeminiChat(userMessage, conversationHistory) {
  if (!isUserAuthorized()) {
    throw new Error("Accès non autorisé.");
  }
  if (!GEMINI_KEY || GEMINI_KEY === "YOUR_GEMINI_API_KEY") {
    throw new Error("Clé API Gemini non configurée.");
  }

  // --- File Context Processing ---
  const filesToProcessForContext = getFileIdsFromFolderForContext();
  let contextFromFiles = ""; // A single string to hold all text from files.

  if (filesToProcessForContext.length > 0) {
    Logger.log(`Processing ${filesToProcessForContext.length} files from folder for Gemini context.`);
    
    for (const fileId of filesToProcessForContext) {
      try {
        const fileData = getAndCacheFileContent(fileId);

        if (fileData.error) {
          contextFromFiles += `[System Note: File "${fileData.fileName || fileId}" could not be processed. Reason: ${fileData.error}]\n\n`;
        } else if (fileData.fileContent) {
          // Add file content to the context string with clear delimiters.
          contextFromFiles += `--- CONTEXT FROM FILE: ${fileData.fileName} ---\n`;
          contextFromFiles += `${fileData.fileContent}\n`;
          contextFromFiles += `--- END OF CONTEXT FROM FILE: ${fileData.fileName} ---\n\n`;
        }
      } catch (e) {
        Logger.log(`Failed to process file ${fileId} for Gemini: ${e.toString()}`);
        contextFromFiles += `[System Note: Error processing context file ID ${fileId}. Details: ${e.message}]\n\n`;
      }
    }
  }

  // --- Construct Final Prompt ---
  let finalUserPrompt = "";
  if (contextFromFiles.trim() !== "") {
    finalUserPrompt = "Use the following context to answer the user's question.\n\n" +
                      "CONTEXT:\n" +
                      contextFromFiles +
                      "---\n\n" +
                      "USER QUESTION:\n" +
                      userMessage;
    Logger.log("Context from files is being added to the prompt.");
  } else {
    finalUserPrompt = userMessage;
    Logger.log("No context from files to add to the prompt.");
  }

  let currentConversation = JSON.parse(JSON.stringify(conversationHistory));
  // The user's turn now consists of a single text part containing the context and the query.
  currentConversation.push({ role: "user", parts: [{ text: finalUserPrompt }] });

  const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
  ];

  const payload = {
    contents: currentConversation,
    safetySettings: safetySettings,
    generationConfig: { /* temperature: 0.7, maxOutputTokens: 8192 */ }
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_KEY}`;
  const options = {
    method: "POST",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode === 200) {
      const data = JSON.parse(responseText);
      let modelResponseText = "";
      if (data.candidates && data.candidates[0]?.content?.parts) {
        modelResponseText = data.candidates[0].content.parts.map(part => part.text || "").join("");
      }
      
      if (!modelResponseText && data.candidates && data.candidates[0]?.finishReason) {
        const { finishReason, safetyRatings } = data.candidates[0];
        if (finishReason === "SAFETY") { modelResponseText = "[Réponse bloquée par les paramètres de sécurité de l'IA.]"; }
        else if (finishReason === "MAX_TOKENS") { modelResponseText = "[Réponse tronquée car la limite de tokens a été atteinte.]"; }
        else if (finishReason === "RECITATION") { modelResponseText = "[Réponse bloquée pour cause de récitation de contenu protégé.]"; }
        else { modelResponseText = `[L'IA n'a pas pu générer de réponse (Raison: ${finishReason}).]`; }
        if(safetyRatings) Logger.log(`Safety ratings: ${JSON.stringify(safetyRatings)}`);
      } else if (!modelResponseText && data.promptFeedback?.blockReason) {
         modelResponseText = `[Votre message a été bloqué avant d'atteindre l'IA. Raison: ${data.promptFeedback.blockReason}.]`;
         Logger.log(`Prompt Feedback: ${JSON.stringify(data.promptFeedback)}`);
      } else if (!modelResponseText) {
        modelResponseText = "[L'IA n'a pas retourné de réponse textuelle.]";
      }
      Logger.log("Gemini response (first 200 chars): " + modelResponseText.substring(0, 200));
      return modelResponseText;
    } else {
      Logger.log(`Gemini API Error ${responseCode}: ${responseText}`);
      let errorMsg = `[Erreur de l'API Gemini (${responseCode}).]`;
      try {
        const errorDetails = JSON.parse(responseText);
        if (errorDetails?.error?.message) {
          errorMsg = `[Erreur de l'API Gemini (${responseCode}): ${errorDetails.error.message}]`;
        }
      } catch (parseError) { /* Ignore */ }
      return errorMsg;
    }
  } catch (e) {
    Logger.log(`Exception during Gemini call: ${e.toString()}`);
    return `[Exception lors de l'appel à l'IA: ${e.message}]`;
  }
}
