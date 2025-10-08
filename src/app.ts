import {
    FaceDetector,
    FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/+esm";

let faceDetector: FaceDetector;
let video: HTMLVideoElement;
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let animationId: number;
let bgMusic: HTMLAudioElement;
let enhancementEnabled = true;
let conversationHistory: any[] = [];
let isProcessingNarration = false;
let currentNarration = "---";

const statusEl = document.getElementById("status")!;

function setStatus(message: string, type: "loading" | "ready" | "error") {
    statusEl.textContent = message;
    statusEl.className = type;
}

async function initializeFaceDetector() {
    try {
        setStatus("Loading MediaPipe model...", "loading");

        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
        );

        faceDetector = await FaceDetector.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath:
                    "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
                delegate: "GPU",
            },
            runningMode: "VIDEO",
        });

        setStatus("Model loaded! Starting webcam...", "loading");
        return true;
    } catch (error) {
        console.error("Error initializing face detector:", error);
        setStatus(`Error: ${error}`, "error");
        return false;
    }
}

async function initializeWebcam() {
    try {
        video = document.getElementById("webcam") as HTMLVideoElement;
        canvas = document.getElementById("canvas") as HTMLCanvasElement;
        ctx = canvas.getContext("2d")!;

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 },
            audio: false,
        });

        video.srcObject = stream;

        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                resolve(true);
            };
        });

        setStatus("✓ Ready! Detecting faces...", "ready");
        return true;
    } catch (error) {
        console.error("Error accessing webcam:", error);
        setStatus(`Webcam error: ${error}`, "error");
        return false;
    }
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    let h = 0;
    const s = max === 0 ? 0 : diff / max;
    const v = max;

    if (diff !== 0) {
        if (max === r) {
            h = ((g - b) / diff + (g < b ? 6 : 0)) / 6;
        } else if (max === g) {
            h = ((b - r) / diff + 2) / 6;
        } else {
            h = ((r - g) / diff + 4) / 6;
        }
    }

    return [h * 360, s, v];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    h /= 360;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    let r = 0, g = 0, b = 0;

    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }

    return [r * 255, g * 255, b * 255];
}
function enhanceImage(imageData: ImageData): ImageData {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    const contrast = 1.3;
    const saturationScale = 0.7;
    const warmth = 1.15;
    const coolReduction = 0.85;

    for (let i = 0; i < data.length; i += 4) {
        let r = data[i]! / 255;
        let g = data[i + 1]! / 255;
        let b = data[i + 2]! / 255;

        r = Math.pow(r, contrast);
        g = Math.pow(g, contrast);
        b = Math.pow(b, contrast);

        const [h, s, v] = rgbToHsv(r * 255, g * 255, b * 255);

        const newS = s * saturationScale;

        let [newR, newG, newB] = hsvToRgb(h, newS, v);

        newR = newR * warmth;
        newG = newG * warmth * 0.95;
        newB = newB * coolReduction;

        const x = (i / 4) % width;
        const y = Math.floor(i / 4 / width);
        const centerX = width / 2;
        const centerY = height / 2;
        const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
        const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
        const vignette = 1 - (dist / maxDist) * 0.3;

        newR *= vignette;
        newG *= vignette;
        newB *= vignette;

        data[i] = Math.min(255, Math.max(0, newR));
        data[i + 1] = Math.min(255, Math.max(0, newG));
        data[i + 2] = Math.min(255, Math.max(0, newB));
    }

    return imageData;
}

function addSubtitle(text: string, maxLineLength: number = 50) {
    const fontSize = Math.max(16, canvas.width / 60);
    const font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
    const fontColor = "#FFFFFF";
    const margin = 30;
    const lineSpacing = fontSize * 1.4;
    const padding = 12;

    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
        if ((currentLine + word).length <= maxLineLength) {
            currentLine += word + " ";
        } else {
            if (currentLine) lines.push(currentLine.trim());
            currentLine = word + " ";
        }
    }
    if (currentLine) lines.push(currentLine.trim());

    const textHeightTotal = lineSpacing * lines.length;
    let startY = canvas.height - textHeightTotal - margin;

    ctx.font = font;
    ctx.textAlign = "center";

    let maxWidth = 0;
    for (const line of lines) {
        const metrics = ctx.measureText(line);
        if (metrics.width > maxWidth) {
            maxWidth = metrics.width;
        }
    }

    const bgX = canvas.width / 2 - maxWidth / 2 - padding;
    const bgY = startY - fontSize - padding / 2;
    const bgWidth = maxWidth + padding * 2;
    const bgHeight = textHeightTotal + padding;

    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

    for (const line of lines) {
        const x = canvas.width / 2;

        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 3;
        ctx.strokeText(line, x, startY);

        ctx.fillStyle = fontColor;
        ctx.fillText(line, x, startY);

        startY += lineSpacing;
    }
}

function drawFaceDetections(detections: any) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (enhancementEnabled) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const enhancedData = enhanceImage(imageData);
        ctx.putImageData(enhancedData, 0, 0);
    }

    for (const detection of detections) {
        const bbox = detection.boundingBox;

        ctx.strokeStyle = "#00ff00";
        ctx.lineWidth = 3;
        ctx.strokeRect(bbox.originX, bbox.originY, bbox.width, bbox.height);

        if (detection.categories && detection.categories.length > 0) {
            const confidence = Math.round(detection.categories[0].score * 100);
            ctx.fillStyle = "#00ff00";
            ctx.font = "18px Arial";
            ctx.fillText(
                `${confidence}%`,
                bbox.originX,
                bbox.originY - 5
            );
        }

        if (detection.keypoints) {
            ctx.fillStyle = "#ff0000";
            for (const keypoint of detection.keypoints) {
                ctx.beginPath();
                ctx.arc(keypoint.x * canvas.width, keypoint.y * canvas.height, 3, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
    }

    if (currentNarration && currentNarration !== "---") {
        addSubtitle(currentNarration);
    }
}

function captureFrameAsBase64(): string {
    const tempCanvas = document.createElement("canvas");
    const maxWidth = 500;

    const ratio = maxWidth / video.videoWidth;
    tempCanvas.width = maxWidth;
    tempCanvas.height = video.videoHeight * ratio;

    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);

    return tempCanvas.toDataURL("image/jpeg", 0.8).split(",")[1];
}

async function playNarrationAudio(text: string) {
    try {
        const response = await fetch("/api/speak", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            throw new Error("Failed to generate speech");
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        await audio.play();

        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
        };
    } catch (error) {
        console.error("Failed to play narration audio:", error);
    }
}

async function getNarration() {
    if (isProcessingNarration) return;

    isProcessingNarration = true;

    try {
        const base64Image = captureFrameAsBase64();

        const response = await fetch("/api/narrate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                image: base64Image,
                history: conversationHistory,
            }),
        });

        const data = await response.json();

        if (data.error) {
            console.error("Narration error:", data.error);
            setStatus(`Error: ${data.error}`, "error");
        } else {
            currentNarration = data.narration;

            conversationHistory.push({
                role: "assistant",
                content: currentNarration,
            });

            setStatus("✓ Narration complete", "ready");

            await playNarrationAudio(currentNarration);
        }
    } catch (error) {
        console.error("Failed to get narration:", error);
    } finally {
        isProcessingNarration = false;
    }
}

function initializeNarrationButton() {
    const narrateButton = document.getElementById("narrateButton") as HTMLButtonElement;

    narrateButton.addEventListener("click", async () => {
        narrateButton.disabled = true;
        narrateButton.classList.add("countdown");

        for (let i = 3
            ; i > 0; i--) {
            narrateButton.textContent = `Starting in ${i}...`;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        narrateButton.textContent = "Processing...";
        narrateButton.classList.remove("countdown");

        await getNarration();

        narrateButton.disabled = false;
        narrateButton.textContent = "Start Narration";
    });
}

function detectFaces() {
    if (!video || !faceDetector) return;

    const startTimeMs = performance.now();
    const detections = faceDetector.detectForVideo(video, startTimeMs);

    if (detections && detections.detections) {
        drawFaceDetections(detections.detections);
    }
    animationId = requestAnimationFrame(detectFaces);
}

function initializeMusic() {
    bgMusic = document.getElementById("bgMusic") as HTMLAudioElement;
    const musicButton = document.getElementById("musicButton") as HTMLButtonElement;

    bgMusic.volume = 0.3;

    musicButton.addEventListener("click", () => {
        if (bgMusic.paused) {
            bgMusic.play();
            musicButton.textContent = "Music Playing";
            musicButton.classList.add("playing");
        } else {
            bgMusic.pause();
            musicButton.textContent = "Play Music";
            musicButton.classList.remove("playing");
        }
    });

    bgMusic.play().then(() => {
        musicButton.textContent = "Music Playing";
        musicButton.classList.add("playing");
    }).catch(() => {
        console.log("Autoplay blocked - click the button to start music");
    });
}

function initializeEnhancementToggle() {
    const enhanceButton = document.getElementById("enhanceButton") as HTMLButtonElement;

    enhanceButton.addEventListener("click", () => {
        enhancementEnabled = !enhancementEnabled;
        if (enhancementEnabled) {
            enhanceButton.textContent = "Enhancement: ON";
            enhanceButton.classList.remove("off");
        } else {
            enhanceButton.textContent = "Enhancement: OFF";
            enhanceButton.classList.add("off");
        }
    });
}

async function start() {
    initializeMusic();
    initializeEnhancementToggle();
    initializeNarrationButton();

    const detectorReady = await initializeFaceDetector();
    if (!detectorReady) return;

    const webcamReady = await initializeWebcam();
    if (!webcamReady) return;

    detectFaces();
}

window.addEventListener("beforeunload", () => {
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    if (video && video.srcObject) {
        const tracks = (video.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
    }
});

start();

