async function init() {
  let socket = new WebSocket(`wss://${window.location.host}`);
  const editorContainer = document.getElementById('editorContainer');
  const outputContainer = document.getElementById('outputContainer');
  const toggleViewBtn = document.getElementById('toggle-view');
  const fileNameEditor = document.querySelector('.truncate');
  const loader = document.querySelector('.loader-parent');
  const outputBtn = document.querySelector('.output-btn');
  const fullEditor = document.querySelector('.file-name');
  let editorView = 0;
  let editor;

  try {
    const res = await fetch('/default-code', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      throw new Error('Something went wrong.');
    }

    document.getElementById('code').textContent = data.code;
    const filterFileName = data.filename.toString().split('/');
    fileNameEditor.textContent = filterFileName[1] || data.filename;
  } catch (e) {
    console.error(e);
  }

  editor = CodeMirror.fromTextArea(document.getElementById('code'), {
    mode: 'text/x-c++src',
    theme: 'dracula',
    lineNumbers: true,
    tabSize: 4,
    indentUnit: 4,
    smartIndent: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    styleActiveLine: true,
    foldGutter: true,
    gutters: [
      'CodeMirror-linenumbers',
      'CodeMirror-foldgutter',
      'CodeMirror-lint-markers',
    ],
    lint: true,
    extraKeys: {
      'Ctrl-/': 'toggleComment',
      'Ctrl-Space': 'autocomplete',
    },
  });

  function sendInput(inputField) {
    let input = inputField.value;
    socket.send(JSON.stringify({ type: 'input', input: input }));
    inputField.parentNode.removeChild(inputField);
    document.getElementById(
      'output',
    ).innerHTML += `<span class="output-info">${input}</span><br>`;
  }

  let executionTime = 0;
  function runCode() {
    document.getElementById('output').innerHTML =
      'Compiling...<div class="loading-indicator ml-2"></div>';
    document.getElementById('execution-time').textContent = '0.00s';
    const startTime = performance.now();

    socket.send(JSON.stringify({ type: 'code', code: editor.getValue() }));

    const timer = setInterval(() => {
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      document.getElementById('execution-time').textContent = elapsed + 's';
      executionTime = elapsed + 's';
    }, 100);

    window.currentTimer = timer;

    if (window.innerWidth <= 768) {
      editorContainer.style.display = 'none';
      outputContainer.style.display = 'block';
      outputContainer.classList.add('output-fullscreen');
      toggleViewBtn.innerHTML =
        '<i class="fas fa-terminal"></i><span class="hidden-mobile">Switch</span>';
      editorContainer.style.width = '0%';
      outputContainer.style.width = '100%';
      outputBtn.style.background = 'darkviolet';
      return;
    }

    originalWidthHeight();
  }

  const runCodeElem = document.querySelectorAll('.run-code');
  runCodeElem.forEach((e) => {
    e.addEventListener('click', runCode);
  });

  function showFullEditor() {
    if (window.innerWidth > 768) return;

    editorView = 1;
    outputBtn.style.background = '';
    editorContainer.style.display = 'block';
    editorContainer.classList.add('editor-fullscreen');
    outputContainer.style.display = 'none';
    toggleViewBtn.innerHTML =
      '<i class="fas fa-code"></i><span class="hidden-mobile">Switch</span>';
    editorContainer.style.width = '100%';
    outputContainer.style.width = '0%';
    dragbarHorizontal.style.display = 'none';
  }

  function showOutput() {
    if (window.innerWidth > 768) return;
    editorView = 2;
    outputBtn.style.background = 'darkviolet';
    fullEditor.style.background = '';
    editorContainer.style.display = 'none';
    outputContainer.style.display = 'block';
    outputContainer.classList.add('output-fullscreen');
    toggleViewBtn.innerHTML =
      '<i class="fas fa-terminal"></i><span class="hidden-mobile">Switch</span>';
    editorContainer.style.width = '0%';
    outputContainer.style.width = '100%';
    dragbarHorizontal.style.display = 'none';
  }

  fullEditor.addEventListener('click', showFullEditor);
  outputBtn.addEventListener('click', showOutput);

  function copyCode() {
    navigator.clipboard
      .writeText(editor.getValue())
      .then(() => {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML =
          '<i class="fas fa-check-circle"></i> Code copied to clipboard!';
        document.body.appendChild(toast);

        setTimeout(() => {
          toast.remove();
        }, 3000);
      })
      .catch((err) => {
        console.error('Error copying code: ', err);

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.style.borderLeft = '4px solid var(--error-text)';
        toast.innerHTML =
          '<i class="fas fa-times-circle" style="color: var(--error-text)"></i> Failed to copy code';
        document.body.appendChild(toast);

        setTimeout(() => {
          toast.remove();
        }, 3000);
      });
  }

  const copyCodeElem = document.querySelectorAll('.copy-code');
  copyCodeElem.forEach((e) => {
    e.addEventListener('click', copyCode);
  });

  async function generateCode() {
    const code = editor.getValue();
    const filename = 'main.cpp';

    try {
      showLoading(true, 'Generating...');
      const res = await fetch('/generate-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, filename }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error('Failed to generate URL');
      showLoading(false);
      return data.url;
    } catch (err) {
      showLoading(false);
      console.error(err);
      return null;
    }
  }

  let shareUrl;
  async function generateQrCode() {
    shareUrl = await generateCode();
    try {
      const res = await fetch('/generate-qrcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: shareUrl }),
      });
      if (!res.ok) throw new Error('Failed to generate URL');
      const data = await res.text();
      return data;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async function copyShareCode() {
    try {
      if (!shareUrl) throw new Error('Could not generate URL');

      navigator.clipboard
        .writeText(shareUrl)
        .then(() => {
          const toast = document.createElement('div');
          toast.className = 'toast';
          toast.innerHTML =
            '<i class="fas fa-check-circle"></i> Share url copied to clipboard!';
          document.body.appendChild(toast);

          setTimeout(() => {
            toast.remove();
          }, 3000);
        })
        .catch((err) => {
          console.error('Error copying code: ', err);

          const toast = document.createElement('div');
          toast.className = 'toast';
          toast.style.borderLeft = '4px solid var(--error-text)';
          toast.innerHTML =
            '<i class="fas fa-times-circle" style="color: var(--error-text)"></i> Failed to copy code';
          document.body.appendChild(toast);

          setTimeout(() => {
            toast.remove();
          }, 3000);
        });
    } catch (err) {
      console.error('Error generating URL:', err);

      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.style.borderLeft = '4px solid var(--error-text)';
      toast.innerHTML =
        '<i class="fas fa-times-circle" style="color: var(--error-text)"></i> Failed to generate URL';
      document.body.appendChild(toast);

      setTimeout(() => {
        toast.remove();
      }, 3000);
    }
  }

  const openModalShare = document.querySelectorAll('.open-model');
  openModalShare.forEach((e) => {
    e.addEventListener('click', openShareModel);
  });

  window.addEventListener('resize', () => {
    editor.refresh();
  });

  socket.onmessage = function (event) {
    let data = JSON.parse(event.data);
    let outputBox = document.getElementById('output');

    if (data.type === 'compiled') {
      outputBox.innerHTML =
        'Compiling...<div class="loading-indicator ml-2"></div>';
    } else if (data.type === 'output') {
      outputBox.innerHTML += data.message;
    } else if (data.type === 'error') {
      outputBox.innerHTML = `<span class="output-error">${data.message}</span>`;
    } else if (data.type === 'running') {
      outputBox.innerHTML = '';
    } else if (data.type === 'input-request') {
      let inputField = document.createElement('input');
      inputField.id = 'userInput';
      inputField.type = 'text';
      inputField.className = 'w-full';
      inputField.onkeypress = function (event) {
        if (event.key === 'Enter') {
          sendInput(inputField);
        }
      };
      outputBox.appendChild(inputField);
      inputField.focus();
    } else if (data.type === 'finished') {
      if (window.currentTimer) {
        clearInterval(window.currentTimer);
      }
      outputBox.innerHTML += `<br><br><span class="output-success">=== Compiled in ${executionTime} ===</span>
<span class="output-success">=== Code Execution Successful ===</span>`;
    }
  };

  socket.onerror = function (error) {
    console.error('WebSocket Error:', error);
    document.getElementById('output').innerHTML =
      '<span class="output-error">Connection error! Please check if the server is running.</span>';
    clearInterval(window.currentTimer);
  };

  socket.onclose = function (event) {
    document.getElementById('output').innerHTML =
      '<span class="output-warning">Connection closed. Please refresh the page to reconnect.</span>';

    document.querySelector('.status-item:nth-child(2) span').textContent =
      'Disconnected';
    document.querySelector('.status-item:nth-child(2) span').style.color =
      'var(--error-text)';
    clearInterval(window.currentTimer);
  };

  toggleViewBtn.addEventListener('click', () => {
    editorView++;
    if (editorView === 1) {
      editorContainer.style.display = 'block';
      editorContainer.classList.add('editor-fullscreen');
      outputContainer.style.display = 'none';
      toggleViewBtn.innerHTML =
        '<i class="fas fa-code"></i><span class="hidden-mobile">Switch</span>';
      editorContainer.style.width = '100%';
      outputContainer.style.width = '0%';
      dragbarHorizontal.style.display = 'none';
      outputBtn.style.background = '';
    } else if (editorView === 2) {
      outputBtn.style.background = 'darkviolet';
      editorContainer.style.display = 'none';
      outputContainer.style.display = 'block';
      outputContainer.classList.add('output-fullscreen');
      toggleViewBtn.innerHTML =
        '<i class="fas fa-terminal"></i><span class="hidden-mobile">Switch</span>';
      editorContainer.style.width = '0%';
      outputContainer.style.width = '100%';
    } else {
      editorContainer.style.height = '52%';
      outputContainer.style.height = '48%';
      editorContainer.style.display = 'block';
      outputContainer.style.display = 'block';
      editorContainer.classList.remove('editor-fullscreen');
      outputContainer.classList.remove('output-fullscreen');
      toggleViewBtn.innerHTML =
        '<i class="fas fa-exchange-alt"></i><span class="hidden-mobile">Switch</span>';
      dragbarHorizontal.style.display = 'block';
      outputBtn.style.background = '';
      editorView = 0;
    }
  });

  const dragbarVertical = document.getElementById('dragbar');
  const dragbarHorizontal = document.getElementById('dragbar-horizontal');
  const mainContainer = document.querySelector('.main-container');
  let isResizing = false;
  let resizeType = '';
  let initialX, initialY, initialEditorWidth, initialEditorHeight;

  function handleResize(e) {
    if (!isResizing) return;

    requestAnimationFrame(() => {
      const containerWidth = mainContainer.clientWidth;
      const containerHeight = mainContainer.clientHeight;

      if (resizeType === 'horizontal') {
        const deltaX = e.clientX - initialX;
        let newEditorWidth =
          ((initialEditorWidth + deltaX) / containerWidth) * 100;

        if (newEditorWidth > 20 && newEditorWidth < 80) {
          editorContainer.style.width = `${newEditorWidth}%`;
          outputContainer.style.width = `${100 - newEditorWidth}%`;
        }
      } else if (resizeType === 'vertical') {
        const deltaY = e.clientY - initialY;
        let newEditorHeight =
          ((initialEditorHeight + deltaY) / containerHeight) * 100;

        if (newEditorHeight > 20 && newEditorHeight < 80) {
          editorContainer.style.height = `${newEditorHeight}%`;
          outputContainer.style.height = `${100 - newEditorHeight}%`;
        }
      }
    });
  }

  dragbarVertical.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizeType = 'horizontal';
    initialX = e.clientX;
    initialEditorWidth = editorContainer.getBoundingClientRect().width;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  });

  dragbarHorizontal.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizeType = 'vertical';
    initialY = e.clientY;
    initialEditorHeight = editorContainer.getBoundingClientRect().height;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', handleResize);
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizeType = '';
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    }
  });

  const lightThemes = [
    'default',
    'base16-light',
    'eclipse',
    'mdn-like',
    'neat',
    'paraiso-light',
  ];

  const darkThemes = [
    'dracula',
    'monokai',
    'material',
    'ayu-dark',
    'gruvbox-dark',
    'panda-syntax',
  ];

  const themeSelector = document.querySelector('select');
  const themeToggle = document.querySelector('.mode');
  const savedMode = sessionStorage.getItem('themeMode');
  const savedTheme = sessionStorage.getItem('selectedTheme');
  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

  let themeFlag = savedMode ? savedMode === 'dark' : prefersDarkScheme.matches;

  prefersDarkScheme.addEventListener('change', (e) => {
    if (!savedMode) {
      themeFlag = e.matches;
      applyThemeSettings();
    }
  });

  function updateThemeOptions(themes) {
    themeSelector.innerHTML = '';
    themes.forEach((theme) => {
      const option = document.createElement('option');
      option.value = theme;
      option.textContent = theme;
      themeSelector.appendChild(option);
    });
  }

  function loadTheme(theme) {
    if (theme === 'default') {
      editor.setOption('theme', 'default');
    } else {
      let link = document.getElementById('theme-stylesheet');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'stylesheet';
        link.id = 'theme-stylesheet';
        document.head.appendChild(link);
      }
      link.href = `codemirror/theme/${theme.replace(/\s+/g, '-')}.css`;
      editor.setOption('theme', theme);
    }
    sessionStorage.setItem('selectedTheme', theme);
  }

  function toggleTheme() {
    themeFlag = !themeFlag;
    sessionStorage.setItem('themeMode', themeFlag ? 'dark' : 'light');
    sessionStorage.setItem('selectedTheme', themeFlag ? 'dracula' : 'default');
    applyThemeSettings();
    showToast(`Switched to ${themeFlag ? 'dark' : 'light'} mode!`);
  }

  function applyThemeSettings() {
    document.documentElement.classList.toggle('day', !themeFlag);
    themeToggle.innerHTML = themeFlag
      ? '<i class="fas fa-sun"></i><span class="hidden-mobile">Day</span>'
      : '<i class="fas fa-moon"></i><span class="hidden-mobile">Night</span>';
    updateThemeOptions(themeFlag ? darkThemes : lightThemes);
    const defaultTheme = themeFlag ? 'dracula' : 'default' || savedTheme;
    themeSelector.value = defaultTheme;
    loadTheme(defaultTheme);
  }

  themeToggle.addEventListener('click', toggleTheme);
  themeSelector.addEventListener('change', function () {
    loadTheme(this.value);
  });

  applyThemeSettings();

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
  }

  const modelDiv = document.createElement('div');
  const divCloseX = document.createElement('div');
  const divCopy = document.createElement('div');
  const divModelImg = document.createElement('div');
  const modelImg = document.createElement('img');
  const menu = document.getElementById('menu-toggle');
  const links = document.querySelector('.btn-con');
  const blurCon = document.querySelector('.blur');
  let flag = false;

  async function openShareModel() {
    modelImg.src = await generateQrCode();
    modelDiv.className = 'model-div';
    divCloseX.className = 'model-close';
    divCloseX.innerHTML = '&times;';
    divCopy.className = 'model-copy';
    divCopy.innerHTML = `
          <button class="share-code btn btn-secondary">
            <i class="fa-solid fa-copy"></i>
            COPY URL
          </button>
    `;
    divModelImg.className = 'model-img';
    divModelImg.appendChild(modelImg);
    modelDiv.appendChild(divCloseX);
    modelDiv.appendChild(divCopy);
    modelDiv.appendChild(divModelImg);
    document.body.append(modelDiv);
    if (modelDiv) {
      modelDiv.style.display = 'block';
      links.style.display = window.innerWidth <= 768 ? 'none' : 'block';
      blurCon.style.display = 'none';
    }
    const shareCodeUrl = document.querySelector('.share-code');
    if (shareCodeUrl) {
      shareCodeUrl.addEventListener('click', copyShareCode);
    }
    flag = false;
  }

  divCloseX.addEventListener('click', () => (modelDiv.style.display = 'none'));

  const closeX = document.createElement('span');
  closeX.innerHTML = '&times;';
  closeX.classList.add('closeX');

  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    flag = !flag;

    if (flag) {
      links.style.display = 'block';
      blurCon.style.display = 'block';
      links.insertAdjacentElement('afterbegin', closeX);
      closeX.addEventListener('click', hideLinks, { once: true });
    } else {
      hideLinks();
    }
  });

  blurCon.addEventListener('click', (e) => {
    if (e.target === blurCon) {
      hideLinks();
    }
  });

  function hideLinks() {
    links.style.display = 'none';
    blurCon.style.display = 'none';
    flag = false;
    closeX.remove();
  }

  function showLoading(show, message = 'Loading...') {
    loader.style.display = show ? 'block' : 'none';
    document.querySelector('.loader-container .title').textContent = message;
  }

  function originalWidthHeight() {
    if (!editorContainer || !outputContainer || !toggleViewBtn) return;
    if (window.innerWidth > 768) {
      editorContainer.style.width = '52%';
      outputContainer.style.width = '48%';
      editorContainer.style.height = '100%';
      outputContainer.style.height = '100%';
      editorContainer.style.display = 'block';
      outputContainer.style.display = 'block';
      editorContainer.classList.remove('editor-fullscreen');
      outputContainer.classList.remove('output-fullscreen');
      toggleViewBtn.innerHTML =
        '<i class="fas fa-exchange-alt"></i><span class="hidden-mobile">Switch</span>';
      editorView = 0;
    } else {
      editorView = 1;
      outputBtn.style.background = '';
      editorContainer.style.display = 'block';
      editorContainer.classList.add('editor-fullscreen');
      outputContainer.style.display = 'none';
      toggleViewBtn.innerHTML =
        '<i class="fas fa-code"></i><span class="hidden-mobile">Switch</span>';
      editorContainer.style.width = '100%';
      outputContainer.style.width = '0%';
      dragbarHorizontal.style.display = 'none';
    }
  }

  function isMobile() {
    if (!links || !blurCon || !closeX) return;
    if (window.innerWidth > 768) {
      links.style.display = 'flex';
      closeX.style.display = 'none';
      blurCon.style.display = 'none';
      flag = false;
    } else {
      links.style.display = 'none';
      closeX.style.display = 'block';
      blurCon.style.display = 'none';
    }
  }

  function responsive() {
    originalWidthHeight();
    isMobile();
  }

  responsive();
  window.addEventListener('resize', responsive);
}

document.addEventListener('DOMContentLoaded', init);
