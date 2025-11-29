/*
  File:         popup.js
  Author:       JJA
  Description:  Popup script for SchoolDocs Sharelinks extension. Handles UI interactions and storage
  Date:         29/11/2025
*/

function el(id) { return document.getElementById(id) }

const schoolGuidInput = el('schoolGuid')
const sharelinksList = el('sharelinksList')
const messageEl = el('message')
const settingsCollapsible = el('settingsCollapsible')

const DEFAULTS = { schoolGuid: '' }

function showMessage(text, timeout = 3500) {
  messageEl.textContent = text
  if (timeout > 0) {
    setTimeout(() => { if (messageEl.textContent === text) messageEl.textContent = '' }, timeout)
  }
}

function saveSettings(schoolGuid) {
  chrome.storage.sync.set({ schoolGuid }, () => {
    // silent
  })
}

function loadSettings(callback) {
  chrome.storage.sync.get(DEFAULTS, (items) => {
    const schoolGuid = items.schoolGuid || ''
    schoolGuidInput.value = schoolGuid

    // Set collapsible state: expanded if schoolGuid is empty, collapsed otherwise
    settingsCollapsible.open = !schoolGuid

    if (typeof callback === 'function') callback()
  })
}

// Check if URL is schooldocs.co.nz domain
function isSchoolDocsPage(url) {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.includes('schooldocs.co.nz')
  } catch {
    return false
  }
}

// Extract src from specific tab
async function getDocSrcFromTab(tabId) {
  try {
    // Check if the URL points to a PDF
    const tab = await chrome.tabs.get(tabId);
    const urlObj = new URL(tab.url)
    if (urlObj.pathname.toLowerCase().endsWith('.pdf')) {
      // Strip query parameters
      url = urlObj.origin + urlObj.pathname;
      return url;
    }

    // Else try to get from frame - normal page
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      function: () => {
        const src = top.frames["BODY"].document.baseURI
        return src || null
      }
    })
    return results[0]?.result || null
  } catch (error) {
    console.error('Error executing script on tab:', error)
    return null
  }
}

// Extract title from specific tab
async function getDocTitleFromTab(tabId) {
  try {
    // Check if the URL points to a PDF
    const tab = await chrome.tabs.get(tabId);
    const urlObj = new URL(tab.url)
    if (urlObj.pathname.toLowerCase().endsWith('.pdf')) {
      title = tab.title;
      return title;
    }

    // Else try to get from frame - normal page
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      function: () => {
        const title = top.frames["BODY"].document.title
        return title || null
      }
    })
    return results[0]?.result || null
  } catch (error) {
    console.error('Error executing script on tab:', error)
    return null
  }
}

// Build sharelink with schoolGuid appended as query parameter
function buildSharelink(docSrc, schoolGuid) {
  if (!docSrc || !schoolGuid) return ''
  
  try {
    const url = new URL(docSrc)
    url.searchParams.set('id', schoolGuid)
    return url.toString()
  } catch {
    return ''
  }
}

// Create and append a sharelink item to the list
function createSharelinkItem(sharelink, index, title) {
  const item = document.createElement('div')
  item.className = 'sharelink-item'

  const main = document.createElement('div')
  main.className = 'sharelink-main'

  const titleEl = document.createElement('div')
  titleEl.className = 'sharelink-title'
  titleEl.textContent = title || 'Untitled'

  const input = document.createElement('input')
  input.type = 'text'
  input.value = sharelink
  input.readOnly = true

  main.appendChild(titleEl)
  main.appendChild(input)

  const copyBtn = document.createElement('button')
  copyBtn.textContent = 'Copy'
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(sharelink)
      showMessage('Copied to clipboard!')
    } catch (error) {
      console.error('Failed to copy:', error)
      showMessage('Failed to copy')
    }
  })

  item.appendChild(main)
  item.appendChild(copyBtn)
  sharelinksList.appendChild(item)
}

// Scan all tabs for schooldocs.co.nz sites and collect BODY frame srcs
async function scanAllTabs() {
  sharelinksList.innerHTML = ''
  
  try {
    const tabs = await chrome.tabs.query({})
    if (!tabs || tabs.length === 0) {
      showMessage('No tabs found')
      return
    }

    const schoolGuid = schoolGuidInput.value.trim()
    if (!schoolGuid) {
      showMessage('Enter School Guid in settings')
      return
    }

    // Collect all unique frame srcs from schooldocs tabs with their titles
    const docMap = new Map()

    for (const tab of tabs) {
      if (!isSchoolDocsPage(tab.url)) continue

      try {
        const docSrc = await getDocSrcFromTab(tab.id)
        const title = await getDocTitleFromTab(tab.id)
        if (docSrc && !docMap.has(docSrc)) {
          docMap.set(docSrc, title || '')
        }
      } catch (error) {
        console.error(`Error processing tab ${tab.id}:`, error)
      }
    }

    if (docMap.size === 0) {
      showMessage('No SchoolDocs documents found in focused tabs.')
      return
    }

    // Build sharelinks and display them
    let idx = 0
    for (const [docSrc, title] of docMap.entries()) {
      const sharelink = buildSharelink(docSrc, schoolGuid)
      if (sharelink) {
        createSharelinkItem(sharelink, idx++, title)
      }
    }

    if (sharelinksList.children.length === 0) {
      showMessage('No valid sharelinks generated')
    }
  } catch (error) {
    console.error('Error scanning tabs:', error)
    showMessage('Error scanning tabs')
  }
}

// Auto-save schoolGuid when it changes (on blur)
schoolGuidInput.addEventListener('blur', () => {
  const code = schoolGuidInput.value.trim()
  saveSettings(code)
  showMessage('School Guid saved')
  // Refresh sharelinks after saving guid
  scanAllTabs()
})

// Main page initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings(() => {
    scanAllTabs()
  })

  // Refresh button handler
  const refreshBtn = el('refreshSharelinks')
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      sharelinksList.innerHTML = ''
      scanAllTabs()
      showMessage('Refreshed share links')
    })
  }
})


