// Get DOM elements by ID
const promptInput = document.getElementById("prompt-input");
const sendBtn = document.getElementById("send-btn");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");
const imagePreviewContainer = document.getElementById(
  "image-preview-container"
);
const imagesGrid = document.getElementById("images-grid");
const suggestionCards = document.querySelectorAll(".suggestion-card");
const suggestionContainer = document.querySelector(".suggestion-cards");

// API endpoint routed through backend proxy
const origin = window.location.origin || "";
const isProxyOrigin =
  /(^http(s)?:\/\/localhost:3000$)|(^http(s)?:\/\/127\.0\.0\.1:3000$)/.test(
    origin
  );
const API_BASE_URL = isProxyOrigin ? "" : "http://localhost:3000";
const API_URL = `${API_BASE_URL}/api/chat`;

const userData = {
  file: {
    data: null,
    mime_type: null,
  },
};

const pendingConversations = new Map();
let uploadedImages = [];
const removedBotReplies = new Map();

// Create message element with dynamic classes and return it.
const createMessageElement = (content, ...classes) => {
  const div = document.createElement("div");
  div.classList.add("message", ...classes);
  div.innerHTML = content;
  return div;
};

// Generate bot response using API
const generateBotResponse = async (
  incomingMessageDiv,
  payload,
  abortController,
  messageId
) => {
  const messageElement = incomingMessageDiv.querySelector(".message-text");

  const requestOptions = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: abortController.signal,
  };

  try {
    const response = await fetch(API_URL, requestOptions);
    const rawBody = await response.text();

    if (!rawBody) {
      throw new Error(
        "Empty response from server. Ensure the proxy server is running on port 3000."
      );
    }

    let data;
    try {
      data = JSON.parse(rawBody);
    } catch (parseError) {
      throw new Error(
        "Server returned malformed JSON. Check the proxy server logs for details."
      );
    }

    if (!response.ok) throw new Error(data.error.message);

    const apiResponseText = (data.choices?.[0]?.message?.content || "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/^\s*\*\s+/gm, "- ")
      .trim();

    if (!apiResponseText) {
      throw new Error("Groq API returned an empty response.");
    }

    if (messageElement) {
      typeMessageText(messageElement, apiResponseText);
    }
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    console.log(error);
    if (messageElement) {
      messageElement.innerText = error.message;
      messageElement.style.color = "#ae2727ff";
    }
  } finally {
    pendingConversations.delete(messageId);

    if (incomingMessageDiv) {
      incomingMessageDiv.classList.remove("thinking");

      if (incomingMessageDiv.isConnected) {
        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
      }
    }
  }
};

// Get chat body element - create it early but keep it hidden initially
const chatBody = document.createElement("div");
chatBody.className = "chat-body hidden";

// Append chat body to main content (will be positioned above input)
window.addEventListener("DOMContentLoaded", () => {
  const mainContent = document.querySelector(".main-content");
  const inputContainer = document.querySelector(".input-container");

  // Insert chat body before the input container
  if (inputContainer && inputContainer.parentElement) {
    inputContainer.parentElement.insertBefore(chatBody, inputContainer);
  } else {
    mainContent.appendChild(chatBody);
  }
});

// Populate prompt field when a suggestion is chosen
suggestionCards.forEach((card) => {
  card.addEventListener("click", () => {
    const prompt = card.dataset.prompt?.trim();
    if (prompt) {
      promptInput.value = prompt;
      promptInput.focus();
    }
  });
});

const createMessageId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const clearCurrentAttachments = () => {
  uploadedImages = [];
  imagesGrid.innerHTML = "";
  imagePreviewContainer.classList.add("hidden");
  userData.file = {
    data: null,
    mime_type: null,
  };
};

// Types bot responses character by character for a typing effect.
const typeMessageText = (element, text) => {
  if (!element) {
    return;
  }

  const characters = Array.from(text);
  const totalLength = characters.length;

  if (totalLength === 0) {
    element.innerText = "";
    delete element.dataset.typingId;
    element.style.removeProperty("color");
    return;
  }

  const typingId = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  element.dataset.typingId = typingId;
  element.innerText = "";
  element.style.removeProperty("color");

  const baseDelay = totalLength > 160 ? 10 : totalLength > 80 ? 14 : 20;

  const typeNextChar = (index) => {
    if (
      !element.isConnected ||
      element.dataset.typingId !== typingId ||
      index >= totalLength
    ) {
      delete element.dataset.typingId;
      return;
    }

    element.innerText = characters.slice(0, index + 1).join("");

    if (index === totalLength - 1) {
      delete element.dataset.typingId;
      return;
    }

    const currentChar = characters[index];
    let delay = baseDelay;

    if (currentChar === "." || currentChar === "?" || currentChar === "!") {
      delay += 80;
    } else if (
      currentChar === "," ||
      currentChar === ";" ||
      currentChar === ":"
    ) {
      delay += 50;
    } else if (currentChar === "\n") {
      delay += 120;
    } else if (currentChar === " ") {
      delay = Math.max(8, delay - 6);
    }

    window.setTimeout(() => typeNextChar(index + 1), delay);
  };

  typeNextChar(0);
};

const removeExistingEditButtons = () => {
  chatBody
    .querySelectorAll(".user-message .message-actions")
    .forEach((actions) => actions.remove());
};

const cancelPendingConversation = (messageId) => {
  if (!messageId) {
    return;
  }

  const conversationState = pendingConversations.get(messageId);
  if (!conversationState) {
    return;
  }

  if (conversationState.timeoutId) {
    clearTimeout(conversationState.timeoutId);
  }

  if (
    conversationState.abortController &&
    !conversationState.abortController.signal.aborted
  ) {
    conversationState.abortController.abort();
  }

  if (conversationState.incomingMessageDiv?.isConnected) {
    conversationState.incomingMessageDiv.remove();
  }

  pendingConversations.delete(messageId);
};

const cancelOtherInlineEdits = (currentMessage) => {
  const activeEdit = chatBody.querySelector(".user-message.editing");
  if (activeEdit && activeEdit !== currentMessage) {
    cancelEditingMessage(activeEdit);
  }
};

const startEditingMessage = (messageDiv) => {
  if (!messageDiv || messageDiv.classList.contains("editing")) {
    return;
  }

  cancelOtherInlineEdits(messageDiv);

  const messageId = messageDiv.dataset.messageId || createMessageId();
  messageDiv.dataset.messageId = messageId;

  cancelPendingConversation(messageId);

  const nextMessage = messageDiv.nextElementSibling;
  if (nextMessage?.classList.contains("bot-message")) {
    removedBotReplies.set(messageId, nextMessage);
    nextMessage.remove();
  } else {
    removedBotReplies.delete(messageId);
  }

  const messageTextElement = messageDiv.querySelector(".message-text");
  const originalText = messageTextElement?.textContent ?? "";

  messageDiv.dataset.originalText = originalText;
  messageDiv.classList.add("editing");

  if (messageTextElement) {
    messageTextElement.setAttribute("data-hidden", "true");
  }

  messageDiv.querySelector(".message-actions")?.remove();

  const editContainer = document.createElement("div");
  editContainer.className = "message-edit-container";

  const editInput = document.createElement("textarea");
  editInput.className = "message-edit-input";
  editInput.value = originalText;
  editInput.rows = Math.min(8, Math.max(2, originalText.split("\n").length));

  const editActions = document.createElement("div");
  editActions.className = "message-edit-actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "message-action-btn cancel-btn";
  cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", () =>
    cancelEditingMessage(messageDiv)
  );

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "message-action-btn save-btn";
  saveButton.textContent = "Save";
  saveButton.addEventListener("click", () =>
    submitEditedMessage(messageDiv, editInput.value)
  );

  editInput.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      submitEditedMessage(messageDiv, editInput.value);
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditingMessage(messageDiv);
    }
  });

  editActions.appendChild(cancelButton);
  editActions.appendChild(saveButton);

  editContainer.appendChild(editInput);
  editContainer.appendChild(editActions);
  messageDiv.appendChild(editContainer);

  window.requestAnimationFrame(() => {
    editInput.focus();
    const length = editInput.value.length;
    if (typeof editInput.setSelectionRange === "function") {
      editInput.setSelectionRange(length, length);
    }
  });
};

const addEditButton = (messageDiv) => {
  if (!messageDiv || messageDiv.classList.contains("editing")) {
    return;
  }

  messageDiv.querySelector(".message-actions")?.remove();

  const actions = document.createElement("div");
  actions.className = "message-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "message-action-btn edit-btn";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => startEditingMessage(messageDiv));

  actions.appendChild(editButton);
  messageDiv.appendChild(actions);
};

const removeInlineEditor = (messageDiv) => {
  messageDiv.querySelector(".message-edit-container")?.remove();
  const messageTextElement = messageDiv.querySelector(".message-text");
  if (messageTextElement) {
    messageTextElement.removeAttribute("data-hidden");
  }
  messageDiv.classList.remove("editing");
  delete messageDiv.dataset.originalText;
};

const cancelEditingMessage = (messageDiv, suppressButtonRestore = false) => {
  if (!messageDiv) {
    return;
  }

  const messageId = messageDiv.dataset.messageId;
  const storedBotMessage = messageId
    ? removedBotReplies.get(messageId)
    : undefined;

  const originalText = messageDiv.dataset.originalText ?? "";
  const messageTextElement = messageDiv.querySelector(".message-text");
  if (messageTextElement) {
    messageTextElement.textContent = originalText;
  }

  removeInlineEditor(messageDiv);

  if (storedBotMessage && messageDiv.parentElement) {
    messageDiv.parentElement.insertBefore(
      storedBotMessage,
      messageDiv.nextSibling
    );
    removedBotReplies.delete(messageId);
  }

  if (!suppressButtonRestore) {
    addEditButton(messageDiv);
  }
};

const scheduleBotResponse = (conversationState, anchorElement) => {
  const targetAnchor = anchorElement || null;

  conversationState.timeoutId = window.setTimeout(() => {
    if (!pendingConversations.has(conversationState.messageId)) {
      return;
    }

    const botMessageContent = `
      <div class="bot-avatar" aria-hidden="true">
      </div>
      <div class="message-text">
        <div class="thinking-indicator">
          <div class="dot"></div>
          <div class="dot"></div>
          <div class="dot"></div>
        </div>
      </div>
    `.trim();

    const incomingMessageDiv = createMessageElement(
      botMessageContent,
      "bot-message",
      "thinking"
    );

    conversationState.incomingMessageDiv = incomingMessageDiv;

    const parent = targetAnchor?.parentElement || chatBody;
    if (parent) {
      parent.insertBefore(
        incomingMessageDiv,
        targetAnchor?.nextSibling || null
      );
    } else {
      chatBody.appendChild(incomingMessageDiv);
    }

    chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

    generateBotResponse(
      incomingMessageDiv,
      conversationState.payload,
      conversationState.abortController,
      conversationState.messageId
    );
  }, 600);
};

const submitEditedMessage = (messageDiv, newValue) => {
  if (!messageDiv) {
    return;
  }

  const trimmedValue = newValue.trim();
  if (!trimmedValue) {
    const input = messageDiv.querySelector(".message-edit-input");
    if (input) {
      input.focus();
    }
    return;
  }

  const messageTextElement = messageDiv.querySelector(".message-text");
  if (messageTextElement) {
    messageTextElement.textContent = trimmedValue;
  }

  removeInlineEditor(messageDiv);

  removeExistingEditButtons();
  addEditButton(messageDiv);

  const messageId = messageDiv.dataset.messageId || createMessageId();
  messageDiv.dataset.messageId = messageId;

  const abortController = new AbortController();
  const conversationState = {
    messageId,
    abortController,
    payload: {
      message: trimmedValue,
      file: null,
    },
    incomingMessageDiv: null,
    timeoutId: null,
  };

  pendingConversations.set(messageId, conversationState);

  removedBotReplies.delete(messageId);

  scheduleBotResponse(conversationState, messageDiv);
};

// Handle outgoing user message
const handleOutgoingMessage = (e, overrideMessage = null) => {
  e.preventDefault();

  const rawMessage =
    overrideMessage !== null ? overrideMessage : promptInput.value;
  const messageToSend = rawMessage.trim();

  const filePayload =
    userData.file && userData.file.data && userData.file.mime_type
      ? { ...userData.file }
      : null;

  if (!messageToSend && !filePayload) {
    return;
  }

  promptInput.value = "";

  const greeting = document.querySelector(".greeting");
  if (greeting && greeting.style.display !== "none") {
    greeting.style.display = "none";
  }
  chatBody.classList.remove("hidden");
  suggestionContainer?.classList.add("hidden");
  document.body.classList.add("chat-active");

  removeExistingEditButtons();

  const messageContent = `<div class="message-text"></div>
    ${
      filePayload
        ? `<img src="data:${filePayload.mime_type};base64,${filePayload.data}" class="attachment" />`
        : ""
    }`;
  const outgoingMessageDiv = createMessageElement(
    messageContent,
    "user-message"
  );
  const messageTextElement = outgoingMessageDiv.querySelector(".message-text");
  if (messageTextElement) {
    messageTextElement.textContent = messageToSend;
  }

  const messageId = createMessageId();
  outgoingMessageDiv.dataset.messageId = messageId;

  chatBody.appendChild(outgoingMessageDiv);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

  if (!filePayload) {
    addEditButton(outgoingMessageDiv);
  }

  const abortController = new AbortController();
  const conversationState = {
    messageId,
    abortController,
    payload: {
      message: messageToSend,
      file: filePayload,
    },
    incomingMessageDiv: null,
    timeoutId: null,
  };

  pendingConversations.set(messageId, conversationState);

  scheduleBotResponse(conversationState, outgoingMessageDiv);

  clearCurrentAttachments();
};

// Handle Enter key press for sending messages.
promptInput.addEventListener("keydown", (e) => {
  const userMessage = e.target.value.trim();
  if (e.key === "Enter" && userMessage && !e.shiftKey) {
    handleOutgoingMessage(e);
  }
});

// Handle upload button click
uploadBtn.addEventListener("click", () => {
  fileInput.click();
});

// Handle file selection - supports multiple files
fileInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);

  files.forEach((file) => {
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();

      reader.onload = (event) => {
        // Create unique ID for this image
        const imageId = Date.now() + Math.random();

        // Store the image data
        uploadedImages.push({
          id: imageId,
          file: file,
          dataUrl: event.target.result,
        });

        // Also update userData.file for the first image (for API compatibility)
        if (uploadedImages.length === 1) {
          const base64Data = event.target.result.split(",")[1];
          userData.file = {
            data: base64Data,
            mime_type: file.type,
          };
        }

        // Create and display the preview
        addImagePreview(imageId, event.target.result);

        // Show the preview container
        imagePreviewContainer.classList.remove("hidden");
      };

      reader.readAsDataURL(file);
    }
  });

  // Reset file input
  fileInput.value = "";
});

// Add image preview to the grid
function addImagePreview(imageId, dataUrl) {
  const imageWrapper = document.createElement("div");
  imageWrapper.className = "image-wrapper";
  imageWrapper.dataset.imageId = imageId;

  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = "Preview";

  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-image-btn";
  removeBtn.title = "Remove image";
  removeBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  `;

  removeBtn.addEventListener("click", () => {
    removeImage(imageId);
  });

  imageWrapper.appendChild(removeBtn);
  imageWrapper.appendChild(img);
  imagesGrid.appendChild(imageWrapper);
}

// Remove specific image
function removeImage(imageId) {
  // Remove from array
  uploadedImages = uploadedImages.filter((img) => img.id !== imageId);

  // Remove from DOM
  const imageWrapper = document.querySelector(
    `.image-wrapper[data-image-id="${imageId}"]`
  );
  if (imageWrapper) {
    imageWrapper.remove();
  }

  // Update userData.file with the first remaining image or clear it
  if (uploadedImages.length > 0) {
    const firstImage = uploadedImages[0];
    const base64Data = firstImage.dataUrl.split(",")[1];
    userData.file = {
      data: base64Data,
      mime_type: firstImage.file.type,
    };
  } else {
    userData.file = {
      data: null,
      mime_type: null,
    };
    imagePreviewContainer.classList.add("hidden");
  }
}

// Handle send button click
sendBtn.addEventListener("click", (e) => {
  const message = promptInput.value.trim();
  const hasImages = uploadedImages.length > 0;

  if (!message && !hasImages) {
    return;
  }

  const outgoingMessage = message || "What's in this image?";
  handleOutgoingMessage(e, outgoingMessage);
});
