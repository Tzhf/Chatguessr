"use strict";

// Parcel prevents us from `require`ing things in a "standard" script
// and ONLY wants to output ES modules in a module. We must use `require`
// for electron reasons. This hack prevents Parcel from seeing what we're
// doing.
/** @type {typeof require} */
// @ts-ignore
const secretRequire = (0, eval("require"));
const { ipcRenderer } = secretRequire("electron");
const { version } = secretRequire("../../package.json"); // path relative to dist/settings

/** @type {HTMLInputElement} */
const channelName = qs("#channelName");
/** @type {HTMLInputElement} */
const botUsername = qs("#botUsername");
/** @type {HTMLInputElement} */
const twitchToken = qs("#twitchToken");
/** @type {HTMLInputElement} */
const cgCmd = qs("#cgCmd");
/** @type {HTMLInputElement} */
const cgMsg = qs("#cgMsg");
/** @type {HTMLInputElement} */
const userGetStatsCmd = qs("#userGetStatsCmd");
/** @type {HTMLInputElement} */
const userClearStatsCmd = qs("#userClearStatsCmd");
/** @type {HTMLInputElement} */
const showHasGuessed = qs("#showHasGuessed");
/** @type {HTMLInputElement} */
const isMultiGuess = qs("#isMultiGuess");
/** @type {HTMLInputElement} */
const cgLink = qs("#cgLink");
/** @type {HTMLElement} */
const cgLinkContainer = qs("#cgLinkContainer");
/** @type {HTMLButtonElement} */
const copyLinkBtn = qs("#copyLinkBtn");
/** @type {HTMLElement} */
const twitchStatusElement = qs("#twitchStatus");
/** @type {HTMLElement} */
const socketStatusElement = qs("#socketStatus");
/** @type {HTMLButtonElement} */
const clearStatsBtn = qs("#clearStatsBtn");
/** @type {HTMLInputElement} */
const banUserInput = qs("#banUserInput");
/** @type {HTMLDivElement} */
const bannedUsersList = qs("#bannedUsersList");
/** @type {HTMLElement} */
const versionText = qs("#version");

let bannedUsersArr = [];

ipcRenderer.on("render-settings", (e, settings, bannedUsers, twitchStatus, socketStatus) => {
	channelName.value = settings.channelName;
	botUsername.value = settings.botUsername;
	twitchToken.value = settings.token;
	cgCmd.value = settings.cgCmd;
	cgMsg.value = settings.cgMsg;
	userGetStatsCmd.value = settings.userGetStatsCmd;
	userClearStatsCmd.value = settings.userClearStatsCmd;
	showHasGuessed.checked = settings.showHasGuessed;
	isMultiGuess.checked = settings.isMultiGuess;

	bannedUsersArr = [...bannedUsers];
	let newChilds = [];
	bannedUsersArr.map((user) => {
		const userBadge = createBadge(user.username);
		newChilds.push(userBadge);
	});
	bannedUsersList.replaceChildren(...newChilds);

	if (twitchStatus == "OPEN") {
		twitchConnected(settings.botUsername);
	} else {
		twitchDisconnected();
	}

	if (socketStatus) {
		socketConnected();
	} else {
		socketDisconnected();
	}
});

ipcRenderer.on("twitch-connected", (e, botUsername) => {
	twitchConnected(botUsername);
});

ipcRenderer.on("twitch-disconnected", () => {
	twitchDisconnected();
});

ipcRenderer.on("twitch-error", (e, error) => {
	twitchStatusElement.textContent = error;
	twitchStatusElement.style.color = "#ed2453";
});

ipcRenderer.on("socket-connected", () => {
	socketConnected();
});

ipcRenderer.on("socket-disconnected", () => {
	socketDisconnected();
});

const twitchConnected = (botUsername) => {
	const linkStr = `chatguessr.com/map/${botUsername}`;
	cgLink.value = linkStr;

	copyLinkBtn.addEventListener("click", () => {
		navigator.clipboard.writeText(linkStr);
		copyLinkBtn.textContent = "Copied";
		setTimeout(() => {
			copyLinkBtn.textContent = "Copy";
		}, 1000);
	});

	cgLinkContainer.style.display = "block";
	twitchStatusElement.textContent = "Connected";
	twitchStatusElement.style.color = "#3fe077";
};

const twitchDisconnected = () => {
	cgLinkContainer.style.display = "none";
	twitchStatusElement.textContent = "Disconnected";
	twitchStatusElement.style.color = "#ed2453";
};

function gameSettingsForm() {
	ipcRenderer.send("game-form", isMultiGuess.checked);
}

function twitchCommandsForm() {
	ipcRenderer.send("twitch-commands-form", {
		cgCmdd: cgCmd.value,
		cgMsgg: cgMsg.value,
		userGetStats: userGetStatsCmd.value,
		userClearStats: userClearStatsCmd.value,
		showHasGuessed: showHasGuessed.checked,
	});
}

function twitchSettingsForm(e) {
	e.preventDefault();
	ipcRenderer.send("twitch-settings-form", channelName.value, botUsername.value, twitchToken.value);
}

const socketConnected = () => {
	socketStatusElement.textContent = "Connected";
	socketStatusElement.style.color = "#3fe077";
};

const socketDisconnected = () => {
	socketStatusElement.textContent = "Disconnected";
	socketStatusElement.style.color = "#ed2453";
};

function clearStats() {
	clearStatsBtn.value = "Are you sure ?";
	clearStatsBtn.setAttribute("onclick", "clearStatsConfirm()");
}

function clearStatsConfirm() {
	clearStatsBtn.value = "Clear all stats";
	clearStatsBtn.setAttribute("onclick", "clearStats()");
	ipcRenderer.send("clearStats");
}

function closeWindow() {
	ipcRenderer.send("closeSettings");
}

function addUser(e) {
	e.preventDefault();
	const input = banUserInput.value.toLowerCase();
	if (input.trim() != "") {
		bannedUsersArr.push({ username: input });
		const userBadge = createBadge(input);
		bannedUsersList.appendChild(userBadge);
		banUserInput.value = "";
		ipcRenderer.send("add-banned-user", input);
	}
}

function removeUser(e) {
	const clickedUser = e.target;
	const itemId = clickedUser.id;
	const index = bannedUsersArr.findIndex((o) => o.username === itemId);
	if (index !== -1) {
		bannedUsersArr.splice(index, 1);
		clickedUser.parentNode.removeChild(clickedUser);
		ipcRenderer.send("delete-banned-user", itemId);
	}
}

function createBadge(username) {
	const userBadge = document.createElement("div");
	userBadge.className = "badge";
	userBadge.textContent = username;
	userBadge.id = username;
	userBadge.title = "Unban";
	userBadge.addEventListener("click", removeUser);
	return userBadge;
}

function openTab(e, tab) {
	for (const el of document.querySelectorAll(".tabcontent")) {
		// @ts-ignore TS2339
		el.style.display = "none";
	}
	for (const el of document.querySelectorAll(".tablinks")) {
		el.classList.remove("active");
	}
	document.getElementById(tab).style.display = "block";
	e.currentTarget.classList.add("active");
}

// @ts-ignore TS2339
qs("#defaultOpen").click();
versionText.append(document.createTextNode(`ChatGuessr version ${version}`));

function qs(selector, parent = document) {
	return parent.querySelector(selector);
}
