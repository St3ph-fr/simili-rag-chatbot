# Gemini RAG-like Chatbot with Google Drive & Apps Script

This project demonstrates how to build a powerful, serverless, RAG-like (Retrieval-Augmented Generation) chatbot using a combination of Google Apps Script, Google Drive, and the incredible power of Google's Gemini 2.0 models.

Instead of setting up complex vector databases and embedding pipelines, this solution leverages the massive **1 million token context window** of Gemini 2.0. It works by retrieving the full text content from your specified files in Google Drive and "stuffing" it directly into the prompt as context for the model. This makes it a simple yet highly effective way to chat with your documents.

## Core Features

-   **🧠 Simili-RAG Architecture:** A simplified Retrieval-Augmented Generation approach perfect for rapid deployment.
-   **🚀 Powered by Gemini 2.0:** Utilizes a state-of-the-art model with a massive context window, allowing it to understand entire documents at once.
-   **📄 Google Drive as a Knowledge Base:** Simply drop your Google Docs, Google Sheets, or `.txt` files into a designated Google Drive folder to add them to the chatbot's knowledge base.
-   **⚡ Serverless & Easy to Deploy:** Runs entirely on Google Apps Script, requiring no server management. Deployable as a web app in minutes.
-   **⏱️ Built-in Caching:** File content is cached for 30 minutes to improve performance and reduce redundant file processing.
-   **🔒 Secure and Configurable:** Access can be restricted to specific Google users.

## How It Works

The workflow is straightforward and powerful:

1.  **User Query:** A user enters a question into the web app interface.
2.  **File Retrieval:** The Google Apps Script backend identifies a designated folder in your Google Drive.
3.  **Text Extraction:** The script iterates through all supported files (Google Docs, Sheets, `.txt`) in the folder. It extracts the raw text content from each one. For Google Sheets, it converts the data into CSV format.
4.  **Context Stuffing:** All the extracted text is concatenated into a single, large block of context. This context is prepended to the user's original question.
5.  **Gemini API Call:** This combined prompt (context + user question) is sent to the Gemini 2.0 API.
6.  **In-Context Response:** Gemini uses the provided text to generate a relevant, context-aware answer.
7.  **Display:** The answer is returned to the user in the web app.

This "context stuffing" method is a practical alternative to traditional RAG for many use cases, made possible by the new generation of large-context-window models.

## Technology Stack

-   **Backend:** Google Apps Script
-   **Language:** JavaScript (Apps Script environment)
-   **LLM:** Google Gemini 2.0 Flash or Gemini 2.0 Flash Lite
-   **Knowledge Base:** Google Drive (Docs, Sheets, TXT files)
-   **Frontend:** HTML, CSS, JavaScript (served by Apps Script)

## Setup and Deployment Guide

Follow these steps to get your own version of the chatbot running.

### Prerequisites

1.  A **Google Account**.
2.  A **Google Cloud Project** Not necessary but better if you want to get better view on Log.
3.  A **Gemini API Key**. You can get one from [Google AI Studio](https://aistudio.google.com/app/apikey).

### Step 1: Create the Apps Script Project

1.  Go to the [Google Apps Script dashboard](https://script.google.com) or click [script.new](https://script.new).
2.  Click **New project**. Give it a descriptive name (e.g., "Gemini Drive Chatbot").

### Step 2: Add the Code

You will need to create three files in your project.

1.  **`Code.gs`:** Delete the default content and paste the entire reworked Google Apps Script code into this file.

2.  **`index.html`:** Click the `+` icon next to "Files" and select "HTML". Name the file `index`. This will be your web app's user interface.


### Step 3: Configure the Script (`Code.gs`)

In the `Code.gs` file, you **must** update the following constants at the top:

-   `GEMINI_KEY`: Replace `"YOUR8API_KEY"` with your actual Gemini API Key.
-   `DRIVE_FOLDER_ID_FOR_CONTEXT`: Replace `"YOUR_FOLDER_ID"` with the ID of the Google Drive folder you want to use. To get the ID, open the folder in your browser; the ID is the last part of the URL.
-   `AUTHORIZED_USERS`: By default, it's `["*"]`, which allows anyone with a Google account to use the app. You can restrict it by replacing `"*"` with a list of email addresses, like `["user1@example.com", "user2@example.com"]`.

### Step 4: Deploy the Web App

Please follow these steps to deploy the Web App from the script editor.

1.  In the script editor, at the top right, click **“Deploy”** -> **“New deployment”**.
2.  Click the gear icon next to “Select type” and choose **“Web App”**.
3.  Enter the information about the Web App in the fields under “Deployment configuration”:
    -   **Description:** (Optional) e.g., "Gemini Chatbot with Drive"
    -   **Execute as:** Select **“Me”** (This means the script runs with your permissions to access Drive and call the API).
    -   **Who has access:** Select **“Anyone”**. _(Note: The script has its own `AUTHORIZED_USERS` check, so even if you select this, only the users you define in the script will be able to get a response from the AI)._
4.  Click **“Deploy”**.
5.  Authorize the script's permissions when prompted. It will need access to Google Drive and to fetch external URLs.
6.  Copy the **Web app URL**. It will be similar to `https://script.google.com/macros/s/###/exec`. This is the link to your chatbot!

Your RAG-like chatbot is now live! You can share the Web App URL with your authorized users.

## Important Considerations

-   **Context Window Limit:** While 1 million tokens is very large, it's not infinite. If you have an extremely large number of documents, the combined text might exceed this limit, causing an error.
-   **Execution Time:** Google Apps Script has a maximum execution time of 6 minutes per call. If you have hundreds of files, the initial text extraction could time out. The caching mechanism helps mitigate this on subsequent runs.
-   **API Costs:** Each call to the Gemini API will incur costs based on the number of input and output tokens. Be mindful of your usage.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
