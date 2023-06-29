/************************
 * Scene Transitions
 * Author @DM_miX since 0.0.8
 * Origianl author credit and big shout out to @WillS
 *************************/
import API from "./api.js";
import CONSTANTS from "./constants.js";
import {
	getVideoType,
	info,
	isVideo,
	retrieveFirstImageFromJournalId,
	retrieveFirstTextFromJournalId,
	SceneTransitionOptions,
	warn,
} from "./lib/lib.js";
import { TransitionForm } from "./scene-transitions-form.js";
import { registerSocket } from "./socket.js";
import { sceneTransitionsSocket } from "./socket.js";
export class SceneTransition {
	/**
	 *
	 * @param {boolean} preview
	 * @param {object} options: v0.1.1 options go here. Previously sceneID
	 * @param {object} optionsBackCompat: Previously used for options. Deprecated as of 0.1.1
	 */
	constructor(preview, options, optionsBackCompat) {
		//Allow for older versions
		if (optionsBackCompat) {
			optionsBackCompat.sceneID = options;
			options = optionsBackCompat;
			warn(
				"sceneID and options have been combined into paramater 2 'new Transition(preview, options)' - update your macro asap"
			);
		}
		this.preview = preview;
		this.options = {
			//@ts-ignore
			...this.constructor.defaultOptions,
			...options,
		};
		// this.sceneID = this.options.sceneID;
		this.journal = null;
		this.modal = null;
		this.destroying = false;
		// if (SceneTransition.hasNewAudioAPI) {
		this.playingAudio = new Sound("");
		// } else {
		// 	this.audio = null;
		// }
	}
	static get defaultOptions() {
		return new SceneTransitionOptions({
			sceneID: "",
			gmHide: true,
			fontColor: "#777777",
			fontSize: "28px",
			bgImg: "",
			bgPos: "center center",
			bgLoop: true,
			bgMuted: true,
			bgSize: "cover",
			bgColor: "#000000",
			bgOpacity: 0.7,
			fadeIn: 400,
			delay: 4000,
			fadeOut: 1000,
			volume: 1.0,
			audioLoop: true,
			skippable: true,
			gmEndAll: true,
			showUI: false,
			activateScene: false,
			content: "",
			audio: "",
			fromSocket: false,
			users: [],
		});
	}
	// static get hasNewAudioAPI() {
	// 	//@ts-ignore
	// 	return typeof Howl != "undefined" ? false : true;
	// }
	/********************
	 * Button functions for Foundry menus and window headers
	 *******************/
	/**
	 * Handles the renderSceneConfig Hook
	 *
	 * Injects HTML into the scene config.
	 *
	 * @static
	 * @param {SceneConfig} sceneConfig - The Scene config sheet
	 * @param {jQuery} html - The HTML of the sheet
	 * @param {object} data - Data associated with the sheet rendering
	 * @memberof PinFixer
	 */
	static async renderSceneConfig(sceneConfig, html, data) {
		const ambItem = html.find(".item[data-tab=ambience]");
		const ambTab = html.find(".tab[data-tab=ambience]");

		ambItem.after(`<a class="item" data-tab="scene-transitions">
		<i class="fas fa-bookmark"></i> ${game.i18n.localize(`${CONSTANTS.MODULE_NAME}.scene.config.title`)}</a>`);
		ambTab.after(await this.getSceneHtml(this.getSceneTemplateData(data)));
		this.attachEventListeners(html);
	}
	/**
	 * The HTML to be added to the scene configuration
	 * in order to configure Pin Fixer for the scene.
	 *
	 * @param {PinFixSettings} settings - The Pin Fixer settings of the scene being configured.
	 * @static
	 * @return {string} The HTML to be injected
	 * @memberof PinFixer
	 */
	static async getSceneHtml(settings) {
		return await renderTemplate(`modules/${CONSTANTS.MODULE_NAME}/templates/transition-form.html`, settings);
	}
	/**
	 * Retrieves the current data for the scene being configured.
	 *
	 * @static
	 * @param {object} data - The data being passed to the scene config template
	 * @return {PinFixSettings}
	 * @memberof PinFixer
	 */
	static getSceneTemplateData(hookData) {
		// scene.getFlag(CONSTANTS.MODULE_NAME, "transition")
		let data = getProperty(hookData.data?.flags[CONSTANTS.MODULE_NAME], "transition.options");
		if (!data) {
			data = {
				sceneID: "",
				gmHide: true,
				fontColor: "#777777",
				fontSize: "28px",
				bgImg: "",
				bgPos: "center center",
				bgLoop: true,
				bgMuted: true,
				bgSize: "cover",
				bgColor: "#000000",
				bgOpacity: 0.7,
				fadeIn: 400,
				delay: 4000,
				fadeOut: 1000,
				volume: 1.0,
				audioLoop: true,
				skippable: true,
				gmEndAll: true,
				showUI: false,
				activateScene: false,
				content: "",
				audio: "",
				fromSocket: false,
				users: [],
			};
		}
		// data.sliders = ["zoomFloor", "zoomCeil", "minScale", "maxScale", "hudScale"]
		// 	.map(name => this.mapSliderData(data, name));

		return data;
	}
	static addPlayTransitionBtn(idField) {
		return {
			name: game.i18n.localize(`${CONSTANTS.MODULE_NAME}.label.playTransition`),
			icon: '<i class="fas fa-play-circle"></i>',
			condition: (li) => {
				const scene = game.scenes?.get(li.data(idField));
				if (game.user?.isGM && typeof scene.getFlag(CONSTANTS.MODULE_NAME, "transition") == "object") {
					return true;
				} else {
					return false;
				}
			},
			callback: (li) => {
				let sceneID = li.data(idField);
				game.scenes?.preload(sceneID, true);
				const scene = game.scenes?.get(li.data(idField));
				//@ts-ignore
				let transition = scene.getFlag(CONSTANTS.MODULE_NAME, "transition");
				let options = transition.options;
				options.sceneID = sceneID;
				options = {
					...options,
					fromSocket: true,
				};
				if (!sceneTransitionsSocket) {
					registerSocket();
				}
				sceneTransitionsSocket.executeForEveryone("executeAction", options);
			},
		};
	}
	static addCreateTransitionBtn(idField) {
		return {
			name: "Create Transition",
			icon: '<i class="fas fa-plus-square"></i>',
			condition: (li) => {
				const scene = game.scenes?.get(li.data(idField));
				if (game.user?.isGM && !scene.getFlag(CONSTANTS.MODULE_NAME, "transition")) {
					return true;
				} else {
					return false;
				}
			},
			callback: (li) => {
				let sceneID = li.data(idField);
				let options = {
					sceneID: sceneID,
				};
				let activeTransition = new SceneTransition(true, options, undefined);
				activeTransition.render();
				new TransitionForm(activeTransition, undefined).render(true);
			},
		};
	}
	static addEditTransitionBtn(idField) {
		return {
			name: "Edit Transition",
			icon: '<i class="fas fa-edit"></i>',
			condition: (li) => {
				const scene = game.scenes?.get(li.data(idField));
				if (game.user?.isGM && scene.getFlag(CONSTANTS.MODULE_NAME, "transition")) {
					return true;
				} else {
					return false;
				}
			},
			callback: (li) => {
				let scene = game.scenes?.get(li.data(idField));
				let transition = scene.getFlag(CONSTANTS.MODULE_NAME, "transition");
				let activeTransition = new SceneTransition(true, transition.options, undefined);
				activeTransition.render();
				new TransitionForm(activeTransition, undefined).render(true);
			},
		};
	}
	static addDeleteTransitionBtn(idField) {
		return {
			name: game.i18n.localize(`${CONSTANTS.MODULE_NAME}.label.deleteTransition`),
			icon: '<i class="fas fa-trash-alt"></i>',
			condition: (li) => {
				const scene = game.scenes?.get(li.data(idField));
				if (game.user?.isGM && scene.getFlag(CONSTANTS.MODULE_NAME, "transition")) {
					return true;
				} else {
					return false;
				}
			},
			callback: (li) => {
				let scene = game.scenes?.get(li.data(idField));
				scene.unsetFlag(CONSTANTS.MODULE_NAME, "transition");
			},
		};
	}
	static addPlayTransitionBtnJE(idField) {
		return {
			name: game.i18n.localize(`${CONSTANTS.MODULE_NAME}.label.playTransitionFromJournal`),
			icon: '<i class="fas fa-play-circle"></i>',
			condition: (li) => {
				if (game.user?.isGM) {
					return true;
				} else {
					return false;
				}
			},
			callback: (li) => {
				let id = li.data(idField);
				let journal = game.journal?.get(id)?.data;
				if (!journal) {
					warn(`No journal is found`);
					return;
				}
				const content = retrieveFirstTextFromJournalId(id, undefined, false);
				const img = retrieveFirstImageFromJournalId(id, undefined, false);
				let options = new SceneTransitionOptions({
					sceneID: undefined,
					content: content,
					bgImg: img,
				});
				options = {
					...options,
					fromSocket: true,
				};
				if (!sceneTransitionsSocket) {
					registerSocket();
				}
				sceneTransitionsSocket.executeForEveryone("executeAction", options);
			},
		};
	}
	/**
	 * The Magic happens here
	 * @returns
	 */
	render() {
		const showTransition = !this.preview;
		SceneTransition.activeTransition = this;
		if (this.options.gmHide && game.user?.isGM) {
			// && this.options.fromSocket
			// warn(`Cannot play the transaction check out the options : ` + JSON.stringify(this.options));
			info(`Option 'gmHide' is true and you are a GM so you don't see the transition`);
			return;
		}

		let zIndex = game.user?.isGM || this.options.showUI ? 1 : 5000;
		this.modal = $("#scene-transitions");

		// https://www.youtube.com/watch?v=05ZHUuQVvJM
		// https://gist.github.com/brickbones/16818b460aede0639e0120f6b013b69e
		if (isVideo(this.options.bgImg)) {
			if (showTransition) {
				$("body").append(
					`<div id="scene-transitions" class="scene-transitions">
						<div class="color-overlay"></div>
						<video class="scene-transitions-bg"
							autoplay
							${this.options.bgLoop ? "loop" : ""}
							${this.options.bgMuted ? "muted" : ""}>
							<source src="${this.options.bgImg}" type="${getVideoType(this.options.bgImg)}">
						</video>
						<div class="scene-transitions-content">
						</div>
					</div>`
				);
			} else {
				$("#scene-transitions").append(
					`
						<div class="color-overlay"></div>
						<video class="scene-transitions-bg"
							autoplay
							${this.options.bgLoop ? "loop" : ""}
							${this.options.bgMuted ? "muted" : ""}>
							<source src="${this.options.bgImg}" type="${getVideoType(this.options.bgImg)}">
						</video>
						<div class="scene-transitions-content">
						</div>
					`
				);
			}

			// let zIndex = game.user?.isGM || this.options.showUI ? 1 : 5000;
			// this.modal = $("#scene-transitions");
			this.modal.css({ backgroundColor: this.options.bgColor, zIndex: zIndex });

			this.modal.find(".scene-transitions-bg").css({
				position: "absolute",
				top: 0,
				left: 0,
				width: "100%",
			});

			this.modal.find(".color-overlay").css({
				opacity: this.options.bgOpacity,
				backgroundColor: this.options.bgColor,
				zIndex: zIndex,
				position: "absolute",
				top: 0,
				left: 0,
				width: "100%",
				height: "100vh",
			});
		} else {
			if (showTransition) {
				$("body").append(
					`<div id="scene-transitions" class="scene-transitions">
						<div class="scene-transitions-bg">
						</div>
						<div class="scene-transitions-content">
						</div>
					</div>`
				);
			} else {
				$("#scene-transitions").append(
					`<div id="scene-transitions" class="scene-transitions">
						<div class="scene-transitions-bg">
						</div>
						<div class="scene-transitions-content">
						</div>
					</div>`
				);
			}

			// let zIndex = game.user?.isGM || this.options.showUI ? 1 : 5000;
			// this.modal = $("#scene-transitions");
			this.modal.css({
				backgroundColor: this.options.bgColor,
				zIndex: zIndex,
			});

			this.modal.find(".scene-transitions-bg").css({
				backgroundImage: "url(" + this.options.bgImg + ")",
				opacity: this.options.bgOpacity,
				backgroundSize: this.options.bgSize,
				backgroundPosition: this.options.bgPos,
			});
		}

		this.modal
			.find(".scene-transitions-content")
			.css({ color: this.options.fontColor, fontSize: this.options.fontSize, zIndex: 5000 })
			.html(this.options.content);

		if (this.options.audio) {
			if (game.audio.locked) {
				info("Audio playback locked, cannot play " + this.options.audio);
			} else {
				let thisTransition = this;
				AudioHelper.play(
					{
						src: this.options.audio,
						volume: this.options.volume,
						loop: String(this.options.audioLoop) === "true" ? true : false,
					},
					false
				).then(function (audio) {
					audio.on("start", (a) => {});
					audio.on("stop", (a) => {});
					audio.on("end", (a) => {});
					thisTransition.playingAudio = audio; // a ref for fading later
				});
			}
		}
		this.modal.fadeIn(this.options.fadeIn, () => {
			if (this.options.activateScene && this.options.sceneID) {
				game.scenes?.get(this.options.sceneID)?.activate();
			} else {
				if (game.user?.isGM && !this.preview && this.options.sceneID) {
					game.scenes?.get(this.options.sceneID)?.activate();
				} else {
					info(
						`The scene is not been activated because isGm=${game.user?.isGM},isPreview=${this.preview},isSceneId=${this.options.sceneID}`
					);
				}
			}
			this.modal?.find(".scene-transitions-content").fadeIn();
			if (!this.preview) {
				this.setDelay();
			}
		});
		if ((this.options.skippable && !this.preview) || (this.options.gmEndAll && game.user?.isGM && !this.preview)) {
			this.modal.on("click", () => {
				if (this.options.gmEndAll && game.user?.isGM) {
					let options = new SceneTransitionOptions({ action: "end" });
					options = {
						...options,
						fromSocket: true,
					};
					if (!sceneTransitionsSocket) {
						registerSocket();
					}
					sceneTransitionsSocket.executeForEveryone("executeAction", options);
				}
				this.destroy();
			});
		}
	}
	setDelay() {
		this.timeout = setTimeout(
			function () {
				this.destroy();
			}.bind(this),
			this.options.delay
		);
	}
	destroy(instant = false) {
		if (this.destroying == true) return;
		this.destroying = true;
		let time = instant ? 0 : this.options.fadeOut;
		clearTimeout(this.timeout);

		if (this.playingAudio?.playing) {
			this.fadeAudio(this.playingAudio, time);
		}

		this.modal?.fadeOut(time, () => {
			this.modal?.remove();
			this.modal = null;
		});
	}
	updateData(newData) {
		this.options = mergeObject(this.options, newData);
		return this;
	}
	getJournalText() {
		//@ts-ignore
		return retrieveFirstTextFromJournalId(this.journal?.id, undefined, false);
	}
	getJournalImg() {
		//@ts-ignore
		return retrieveFirstImageFromJournalId(this.journal?.id, undefined, false);
	}
	fadeAudio(audio, time) {
		if (!audio?.playing) {
			return;
		}
		if (time == 0) {
			audio.stop();
			return;
		}
		let volume = audio.gain.value;
		let targetVolume = 0.000001;
		let speed = (volume / time) * 50;
		audio.gain.value = volume;
		let fade = function () {
			volume -= speed;
			audio.gain.value = volume.toFixed(6);
			if (volume.toFixed(6) <= targetVolume) {
				audio.stop();
				clearInterval(audioFadeTimer);
			}
		};
		let audioFadeTimer = setInterval(fade, 50);
		fade();
	}
}
SceneTransition.activeTransition = new SceneTransition(undefined, undefined, undefined);
