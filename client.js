(() => {
  'use strict';

  // Browser-only interaction bundle. The filename intentionally avoids Vercel's app.js server convention.

  const form = document.querySelector('#downloadForm');
  const input = document.querySelector('#videoUrl');
  const urlField = document.querySelector('.url-field');
  const feedback = document.querySelector('#urlHelp');
  const analyzeButton = document.querySelector('#analyzeButton');
  const pasteButton = document.querySelector('#pasteButton');
  const pipelineSection = document.querySelector('#pipelineSection');
  const resultSection = document.querySelector('#resultSection');
  const currentStage = document.querySelector('#currentStage');
  const stages = [...document.querySelectorAll('.stage')];
  const stageLines = [...document.querySelectorAll('.stage-line')];
  const newLinkButton = document.querySelector('#newLinkButton');
  const downloadButton = document.querySelector('#downloadButton');
  const formatSelect = document.querySelector('#formatSelect');
  const qualitySelect = document.querySelector('#qualitySelect');
  const formatHint = document.querySelector('#formatHint');
  const apiBadge = document.querySelector('#apiBadge');
  const videoThumbnail = document.querySelector('#videoThumbnail');
  const videoDuration = document.querySelector('#videoDuration');
  const videoTitle = document.querySelector('#videoTitle');
  const videoChannel = document.querySelector('#videoChannel');
  const videoMetadata = document.querySelector('#videoMetadata');
  const toastElement = document.querySelector('#appToast');
  const toastMessage = document.querySelector('#toastMessage');
  const appToast = bootstrap.Toast.getOrCreateInstance(toastElement, { delay: 4400 });
  let availableFormats = [];

  const stageCopy = [
    'Checking your link…',
    'Fetching video information…',
    'Preparing available formats…',
    'Your video options are ready.'
  ];

  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  function isYouTubeUrl(value) {
    try {
      const url = new URL(value.trim());
      const host = url.hostname.replace(/^www\./, '').toLowerCase();
      return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
    } catch {
      return false;
    }
  }

  function setError(message = '') {
    feedback.textContent = message;
    urlField.classList.toggle('is-invalid', Boolean(message));
    input.setAttribute('aria-invalid', String(Boolean(message)));
  }

  function setStage(activeIndex) {
    stages.forEach((stage, index) => {
      stage.classList.toggle('is-active', index === activeIndex);
      stage.classList.toggle('is-complete', index < activeIndex || activeIndex === stages.length);
    });
    stageLines.forEach((line, index) => line.classList.toggle('is-complete', index < activeIndex));
    currentStage.textContent = stageCopy[Math.min(activeIndex, stageCopy.length - 1)];
  }

  function finishPipeline() {
    stages.forEach((stage) => {
      stage.classList.remove('is-active');
      stage.classList.add('is-complete');
    });
    stageLines.forEach((line) => line.classList.add('is-complete'));
    currentStage.textContent = stageCopy[3];
  }

  function showToast(message) {
    toastMessage.textContent = message;
    appToast.show();
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainingSeconds = Math.floor(total % 60);
    return hours
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
      : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  function formatViews(value) {
    const count = Number(value || 0);
    return count ? `${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(count)} views` : 'YouTube video';
  }

  function selectedStream() {
    return availableFormats.find((item) => item.token === qualitySelect.value);
  }

  function populateQualityOptions() {
    const type = formatSelect.value;
    const options = availableFormats.filter((item) => item.type === type);
    qualitySelect.innerHTML = '';
    options.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.token;
      option.textContent = `${item.quality} • ${String(item.extension).toUpperCase()}${item.sizeText ? ` • ${item.sizeText}` : ''}`;
      qualitySelect.append(option);
    });
    qualitySelect.disabled = options.length === 0;
    downloadButton.disabled = options.length === 0;
    updateFormatHint();
  }

  function updateFormatHint() {
    const item = selectedStream();
    formatHint.textContent = item
      ? `${item.type === 'video' ? 'Video with audio' : 'Audio'} • ${item.quality} • ${String(item.extension).toUpperCase()}${item.sizeText ? ` • ${item.sizeText}` : ''}`
      : 'No downloadable format is available for this selection.';
  }

  function renderVideo(data) {
    availableFormats = data.formats || [];
    videoTitle.textContent = data.title;
    videoThumbnail.src = data.thumbnail || 'assets/mountain-video-thumbnail.png';
    videoThumbnail.alt = `${data.title} thumbnail`;
    videoDuration.textContent = formatDuration(data.durationSeconds);
    videoChannel.textContent = data.channel;
    if (data.channelVerified) {
      const verified = document.createElement('i');
      verified.className = 'bi bi-patch-check-fill ms-1';
      verified.setAttribute('aria-label', 'Verified');
      videoChannel.append(verified);
    }
    videoMetadata.textContent = formatViews(data.viewCount);

    const hasVideo = availableFormats.some((item) => item.type === 'video');
    const hasAudio = availableFormats.some((item) => item.type === 'audio');
    formatSelect.innerHTML = '';
    if (hasVideo) formatSelect.add(new Option('Video', 'video'));
    if (hasAudio) formatSelect.add(new Option('Audio', 'audio'));
    populateQualityOptions();
  }

  async function analyzeVideo(value) {
    pipelineSection.hidden = false;
    resultSection.hidden = true;
    analyzeButton.disabled = true;
    analyzeButton.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>Analyzing</span>';
    setStage(0);
    await sleep(250);
    setStage(1);

    try {
      const response = await fetch(`/api/video-info?url=${encodeURIComponent(value)}`, { headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The video could not be processed.');
      setStage(2);
      renderVideo(data);
      await sleep(350);
      finishPipeline();
      resultSection.hidden = false;
      resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      pipelineSection.hidden = true;
      setError(error.message || 'The video could not be processed.');
    } finally {
      analyzeButton.disabled = false;
      analyzeButton.innerHTML = '<i class="bi bi-search" aria-hidden="true"></i><span>Analyze video</span>';
    }
  }

  async function checkApiStatus() {
    try {
      const response = await fetch('/api/status', { cache: 'no-store' });
      const data = await response.json();
      apiBadge.classList.toggle('is-offline', !data.configured);
      apiBadge.querySelector('span:last-child').textContent = data.configured ? 'API ready' : 'API setup needed';
    } catch {
      apiBadge.classList.add('is-offline');
      apiBadge.querySelector('span:last-child').textContent = 'Server offline';
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) {
      setError('Paste a YouTube video link to continue.');
      input.focus();
      return;
    }
    if (!isYouTubeUrl(value)) {
      setError('That does not look like a valid YouTube URL.');
      input.focus();
      return;
    }
    setError();
    await analyzeVideo(value);
  });

  input.addEventListener('input', () => {
    if (feedback.textContent) setError();
  });

  pasteButton.addEventListener('click', async () => {
    try {
      input.value = (await navigator.clipboard.readText()).trim();
      setError();
      input.focus();
    } catch {
      showToast('Clipboard access was blocked. Paste the link into the field manually.');
      input.focus();
    }
  });

  newLinkButton.addEventListener('click', () => {
    input.value = '';
    resultSection.hidden = true;
    pipelineSection.hidden = true;
    availableFormats = [];
    setStage(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => input.focus(), 450);
  });

  formatSelect.addEventListener('change', populateQualityOptions);
  qualitySelect.addEventListener('change', updateFormatHint);

  downloadButton.addEventListener('click', () => {
    const item = selectedStream();
    if (!item) {
      showToast('Select an available format before downloading.');
      return;
    }
    const temporaryLink = document.createElement('a');
    temporaryLink.href = `/api/download?token=${encodeURIComponent(item.token)}`;
    temporaryLink.rel = 'noopener';
    document.body.append(temporaryLink);
    temporaryLink.click();
    temporaryLink.remove();
    showToast('Your download has started. Keep this window open until it finishes.');
  });

  checkApiStatus();
})();
