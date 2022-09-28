import sampleMp4 from '../sample.mp4';
// @ts-ignore
import sampleSrt from '../sample.srt'; 
import './style.css'
import SrtParser from 'srt-parser-2';
import IntervalTree from '@flatten-js/interval-tree'
import type { Line } from 'srt-parser-2';

const srtParser = new SrtParser();

const videoInputEl    = document.querySelector<HTMLInputElement>('input#input-video')!;
const srtInputEl      = document.querySelector<HTMLInputElement>('input#input-subs')!;
const videoButtonEl   = document.querySelector<HTMLButtonElement>('button#input-video')!;
const srtButtonEl     = document.querySelector<HTMLButtonElement>('button#input-subs')!;
const playerCanvasEl  = document.querySelector<HTMLCanvasElement>("canvas#player")!;
const playButtonEl    = document.querySelector<HTMLButtonElement>("button#play-pause")!;
const progressEl      = document.querySelector<HTMLProgressElement>("progress#seekbar")!;
const bgVideoEl: HTMLVideoElement = document.createElement("video")!;
const playerCanvasCtx = setupCanvas(playerCanvasEl);

(async function loadsampleSrt () {
	const res = await fetch(sampleSrt);
	const resData = await res.text();
	processSrtData(resData);
})()

loadVideo(bgVideoEl, sampleMp4);

function setupCanvas(canvas: HTMLCanvasElement) {
	const dpr = window.devicePixelRatio || 1;
	const rect = canvas.getBoundingClientRect();
	canvas.width = rect.width * dpr;
	canvas.height = rect.height * dpr;
	const ctx = canvas.getContext('2d')!;
	ctx.scale(dpr, dpr);
	return ctx;
}

interface State {
	videoFile: File | null,
	srtFile: File | null,
	srtFileData: string | null,
	parsedSrt: [Line?]
	srtTree: IntervalTree,
	isPlaying: boolean,
	globalError: boolean,
	alternator: boolean,
}

const state : State = {
	videoFile: null,
	srtFile: null,
	srtFileData: null,
	parsedSrt: [],
	srtTree: new IntervalTree(),
	isPlaying: false,
	globalError: false,
	alternator: false,
}

setInterval(() => state.alternator = !state.alternator, 3500);
function getSubtitleText(timestamp: number) {
	const result = state.srtTree.search([timestamp, timestamp]);
	if (result.length == 0) return null;
	return result[0];
}

function maintainAspectRatio (video: HTMLVideoElement, canvas: HTMLCanvasElement) {
	const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
	const x = (canvas.width / 2) - (video.videoWidth / 2) * scale;
    const y = (canvas.height / 2) - (video.videoHeight / 2) * scale;
	return [x, y, video.videoWidth * scale, video.videoHeight * scale];
}

async function loadVideo(el: HTMLVideoElement, file: File | string) {
	if (typeof file === 'string') {
		el.src = file;
	} else {
		const fileURL = URL.createObjectURL(file)
		el.src = fileURL;
	}

	bgVideoEl.addEventListener('play', () => {
			const resizedDims = maintainAspectRatio(bgVideoEl, playerCanvasEl);
			console.log(resizedDims);
		function step() {

			playerCanvasCtx.drawImage(bgVideoEl, resizedDims[0], resizedDims[1], resizedDims[2], resizedDims[3]);
			playerCanvasCtx.save();

			const subtitleText = getSubtitleText(bgVideoEl.currentTime);
			if (subtitleText) {

				const width = playerCanvasCtx.measureText(subtitleText).width;
				const padding = 10;
				playerCanvasCtx.fillStyle = "rgba(0, 0, 0, 0.7)";

				playerCanvasCtx.fillRect(
					playerCanvasEl.width / 2 - width/2 - padding/2,
					playerCanvasEl.height * 0.85 - 24, width + padding,
					parseInt(playerCanvasCtx.font, 10) + padding
				);
				playerCanvasCtx.save();

				playerCanvasCtx.textAlign = "center";
				playerCanvasCtx.fillStyle = "#fff";
				playerCanvasCtx.font = "normal 24px Arial";
				playerCanvasCtx.fillText(subtitleText, playerCanvasEl.width / 2, playerCanvasEl.height * 0.85);
			}
			requestAnimationFrame(step)
		}
		requestAnimationFrame(step);
	});

	bgVideoEl.addEventListener("timeupdate", () => {
		const percentage = ( bgVideoEl.currentTime / bgVideoEl.duration ) * 100;
		progressEl.value = percentage;
	});

	progressEl.addEventListener("click", (ev) => {
		const rect = progressEl.getBoundingClientRect();
		const offset = {
			top: rect.top + window.scrollY, 
			left: rect.left + window.scrollX,
		};
		const left = (ev.pageX - offset.left);
		const totalWidth = progressEl.clientWidth;
		const percentage = ( left / totalWidth );
		const seekTime = bgVideoEl.duration * percentage;
		bgVideoEl.currentTime = seekTime;
	});

	bgVideoEl.addEventListener ("canplay", () => {
		playButtonEl.addEventListener("click", async () => {
			if (state.isPlaying) {
				await bgVideoEl.pause();
				playButtonEl.innerHTML = "Play";
			} else {
				await bgVideoEl.play();
				playButtonEl.innerHTML = "Pause";
			}
		});
		bgVideoEl.addEventListener("play", () => {
			state.isPlaying = true;
		});
		bgVideoEl.addEventListener("pause", () => {
			state.isPlaying = false;
		});
	});
}

function validateVideoFile(file: File) {
	console.log("video selected", file);
	if (!file) return null;
	return file;
}

function validateSrtFile(file: File) {
	console.log("subs selected", file);
	if (!file) return null;
	return file;
}

function convertToMs(string: string): number {
	const colonSplit = string.split(':');
	const msSpit = colonSplit[2].split(',');
	const hrMs = parseInt(colonSplit[0]) * 3600; 
	const minMs = parseInt(colonSplit[1]) * 60;
	const secMs = parseInt(msSpit[0]);
	const ms = parseInt(msSpit[1]) / 1000;
	return hrMs + minMs + secMs + ms;
}

function makeSrtMap(srtLines: [Line?]) {
	for (const line of srtLines) {
		state.srtTree.insert([convertToMs(line?.startTime!), convertToMs(line?.endTime!)], line?.text);
	}
	return state.srtTree;
}

function processSrtData(string: string) {
	if (!srtParser.correctFormat(string))
		throw new Error("Incorrect srt format");
	state.parsedSrt = srtParser.fromSrt(string) as [Line];
	state.srtTree = makeSrtMap(state.parsedSrt);
}


videoInputEl.addEventListener("change", async (ev: Event) => {
	const target = ev.target as HTMLInputElement;
	if (target.files!.length == 0) return;
	const videoFile = target.files?.item(0)!;
	videoButtonEl.classList.toggle("progress");
	state.videoFile = validateVideoFile(videoFile);
	if (!state.videoFile) return alert("Invalid Video Input selected");

	try {
	}
	catch(err) {
		console.error(err, "Error reading Video File");
		alert("Error reading Video File");
		return;
	}
	finally {
		videoButtonEl.classList.toggle("progress");
	}
	videoButtonEl.classList.toggle("success");
	loadVideo(bgVideoEl, state.videoFile);
});

srtInputEl.addEventListener("change", async (ev: Event) => {
	const target = ev.target as HTMLInputElement;
	if (target.files!.length == 0) return;
	const srtFile = target.files?.item(0)!;
	srtButtonEl.classList.toggle("progress");
	state.srtFile = validateSrtFile(srtFile);
	if (!state.srtFile) return alert("Invalid SRT Input selected");
	
	try {
		state.srtFileData = await state.srtFile.text();
		processSrtData(state.srtFileData);
		console.log(state.parsedSrt, "parsed srt file");
	}
	catch(err) {
		console.error(err, "Error reading SRT File");
		alert("Error reading SRT File");
		return;
	}
	finally {
		srtButtonEl.classList.toggle("progress");
	}
	srtButtonEl.classList.toggle("success");
});

videoButtonEl.addEventListener("click", () => {
	videoInputEl.click();
});
srtButtonEl.addEventListener("click", () => {
	srtInputEl.click();
});
