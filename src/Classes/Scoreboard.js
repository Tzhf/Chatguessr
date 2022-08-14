"use strict";

const $ = require("jquery");
window.$ = window.jQuery = $;
require("jquery-ui-dist/jquery-ui");
require("datatables.net/js/jquery.dataTables")(window, $);
require("datatables.net-plugins/sorting/natural");
require("datatables.net-plugins/features/scrollResize/dataTables.scrollResize")(window, $);
require("datatables.net-buttons/js/dataTables.buttons")(window, $);
require("datatables.net-buttons/js/buttons.colVis")(window, $);
require("datatables.net-scroller/js/dataTables.scroller")(window, $);

/** @typedef {import('../types').Guess} Guess */
/** @typedef {import("../types").LatLng} LatLng */

/**
 * @typedef {object} Options
 * @prop {(open: boolean) => void} onToggleGuesses
 * @prop {(location: LatLng) => void} focusOnGuess
 */

class Scoreboard {
	/**
	 * @param {HTMLElement} container
	 * @param {Options} props
	 */
	constructor(container, props) {
		this.isMultiGuess = false;
		this.isResults = false;
		this.isScrolling = false;
		this.speed = 50;
		this.onToggleGuesses = props.onToggleGuesses;
		this.focusOnGuess = props.focusOnGuess;

		this.visibility = JSON.parse(localStorage.getItem("scoreboard_visibility")) || true;
		this.position = JSON.parse(localStorage.getItem("scoreboard_position")) || { top: 20, left: 5, width: 380, height: 180 };
		this.container = $(container);
		this.scoreboard = $(`
			<div id="scoreboard">
				<div id="scoreboardHeader">
					<span class="scoreboardSettings"></span>
					<span class="scoreboardTitle">GUESSES (0)</span>
					<label id="switchContainer">
						<input id="switchBtn" type="checkbox" />
						<div class="switch"></div>
					</label>
					<div class="scoreboardHint"></div>
					<div class="scoreboardSlider"></div>
				</div>
				<table id='datatable' width='100%'>
					<thead>
						<tr>
							<th>#</th>
							<th>Player</th>
							<th>Streak</th>
							<th>Distance</th>
							<th>Score</th>
						</tr>
					</thead>
					<tbody id='guessList'></tbody>
				</table>
			</div>
		`);
		this.container.append(this.scoreboard);
		this.title = this.scoreboard.find(".scoreboardTitle");
		this.switchContainer = this.scoreboard.find("#switchContainer");
		this.switchBtn = this.scoreboard.find("#switchBtn");

		this.scoreboard
			.css({
				top: this.position.top,
				left: this.position.left,
				width: this.position.width,
				height: this.position.height,
			})
			.resizable({
				handles: "n, e, s, w, ne, se, sw, nw",
				containment: this.container,
			})
			.draggable({
				containment: this.container,
			})
			.on("mouseup", () => {
				const currentPosition = this.getPosition();
				if (JSON.stringify(this.position) !== JSON.stringify(currentPosition)) {
					this.setPosition(currentPosition);
					localStorage.setItem("scoreboard_position", JSON.stringify(currentPosition));
				}
			});

		this.switchBtn.on("change", () => {
			this.onToggleGuesses(this.switchBtn.is(":checked"));
		});

		// Column Visisbility
		this.columnState = JSON.parse(localStorage.getItem("CG_ColVis")) || [
			{ column: 0, state: true },
			{ column: 2, state: true },
			{ column: 3, state: true },
			{ column: 4, state: true },
		];

		this.table = this.scoreboard.find("#datatable").DataTable({
			info: false,
			searching: false,
			paging: false,
			scrollY: "100px",
			scrollResize: true,
			scrollCollapse: true,
			language: { zeroRecords: " " },
			dom: "Bfrtip",
			buttons: [
				{
					extend: "colvis",
					text: "⚙️",
					className: "colvis-btn",
					columns: ":not(.noVis)",
				},
			],
			columns: [
				{ data: "Position" },
				{ data: "Player" },
				{ data: "Streak" },
				{
					data: "Distance",
					render: (data, type) => {
						if (type === "display" || type === "filter") {
							return this.toMeter(data);
						}
						return data;
					},
				},
				{ data: "Score" },
			],
			columnDefs: [
				{ targets: 0, width: "35px", className: "noVis" },
				{ targets: 1, width: "auto", className: "noVis" },
				{ targets: 2, width: "55px" },
				{ targets: 3, width: "100px" },
				{ targets: 4, width: "75px", type: "natural" },
			],
		});

		// Handle ColVis change
		this.table.on("column-visibility.dt", (e, settings, column, state) => {
			if (this.isResults || this.isMultiGuess) return;

			const i = this.columnState.findIndex((o) => o.column === column);
			if (this.columnState[i]) {
				this.columnState[i] = { column, state };
			} else {
				this.columnState.push({ column, state });
			}

			localStorage.setItem("CG_ColVis", JSON.stringify(this.columnState));
		});

		// SCROLLER
		const slider = $(`<input type="range" min="5" max="50" value="20" id="scrollSpeedSlider" />`).on("input", (e) => {
			// @ts-ignore
			this.speed = e.currentTarget.value;
			this.scroller(".dataTables_scrollBody");
		});
		
		this.scoreboard.find(".scoreboardSlider").append(slider);

		this.table.buttons().container().appendTo(this.scoreboard.find(".scoreboardSettings"));

		this.table.buttons().container().prepend(`
				<div class="dt-button scrollBtn">
					<label>
						<input type="checkbox" id="scrollBtn"><span>⮃</span>
					</label>
				</div>
			`);

		this.scoreboard.find("#scrollBtn").on(
			"change",
			/** @param {JQuery.ChangeEvent<HTMLInputElement>} e */ (e) => {
				if (e.currentTarget.checked != true) {
					this.isScrolling = $(e.currentTarget).is(":checked");
					this.stop(".dataTables_scrollBody");
					this.scoreboard.toggleClass("is-slider-visible", false);
				} else {
					this.isScrolling = $(e.currentTarget).is(":checked");
					this.scroller(".dataTables_scrollBody");
					this.scoreboard.toggleClass("is-slider-visible", true);
				}
			}
		);
	}

	/**
	 * @param {boolean} isMultiGuess
	 */
	reset(isMultiGuess) {
		this.isMultiGuess = isMultiGuess;
		this.setColVis();
		this.isResults = false;
		this.setTitle("GUESSES (0)");
		if (this.isMultiGuess) {
			this.#setHint("Ordered by guess time");
		} else {
			this.#setHint(null);
		}
		this.showSwitch(true);
		this.table.clear().draw();
	}

	toogleVisibility() {
		this.visibility = !this.visibility;
		localStorage.setItem("scoreboard_visibility", JSON.stringify(this.visibility));
		this.checkVisibility();
	}

	checkVisibility() {
		if (this.visibility) {
			this.show();
		} else {
			this.hide();
		}
	}

	show() {
		this.container.show();
	}

	hide() {
		this.container.hide();
	}

	/**
	 * @param {Guess} guess
	 */
	renderGuess(guess) {
		const guessRow = {
			Position: "",
			Player: `${guess.flag ? `<span class="flag-icon" style="background-image: url(flag:${guess.flag})"></span>` : ""}<span class='username' style='color:${
				guess.color
			}'>${guess.username}</span>`,
			Streak: guess.streak,
			Distance: guess.distance,
			Score: guess.score,
		};

		// @ts-ignore
		const rowNode = this.table.row.add(guessRow).node();
		rowNode.classList.add("expand");
		setTimeout(() => {
			rowNode.classList.remove("expand");
		}, 200);

		this.table.order([3, "asc"]).draw(false);
		this.table
			.column(0)
			.nodes()
			.each((cell, i) => {
				cell.innerHTML = i + 1;
			});

		this.setTitle(`GUESSES (${this.table.rows().data().length})`);
	}

	/**
	 * @param {{ username: string, flag: string, color: string }[]} guesses
	 */
	renderMultiGuess(guesses) {
		const rows = guesses.map((guess) => {
			return {
				Position: "",
				Player: `${guess.flag ? `<span class="flag-icon" style="background-image: url(flag:${guess.flag})"></span>` : ""}<span class='username' style='color:${
					guess.color
				}'>${guess.username}</span>`,
				Streak: "",
				Distance: "",
				Score: "",
			};
		});

		this.table.clear().draw();
		this.table.rows.add(rows).draw();

		this.setTitle(`GUESSES (${this.table.rows().data().length})`);
	}

	/**
	 *
	 * @param {{ username: string, position: LatLng, color: string, flag: string, streak: number, distance: number, score: number, rounds: number }[]} scores
	 */
	displayScores(scores, isTotal = false) {
		// const self = this;
		this.isResults = true;
		this.#setHint(null);
		if (scores[0]) scores[0].color = "#E3BB39";
		if (scores[1]) scores[1].color = "#C9C9C9";
		if (scores[2]) scores[2].color = "#A3682E";
		const rows = scores.map((score) => {
			return {
				Position: "",
				Player: `${score.flag ? `<span class="flag-icon" style="background-image: url(flag:${score.flag})"></span>` : ""}<span class='username' style='color:${
					score.color
				}'>${score.username}</span>`,
				Streak: score.streak,
				Distance: score.distance,
				Score: `${score.score}${isTotal ? " [" + score.rounds + "]" : ""}`,
			};
		});

		this.table.clear().draw();
		this.table.rows.add(rows);

		// Maybe to the fastest, seems a bit laggy to me with !spamguess but not sure
		// also do we have to remove those listeners to avoid memory leaks ?
		// this.table.rows().every(function (rowIdx) {
		// 	this.node().addEventListener("click", function () {
		// 		self.focusOnGuess(scores[rowIdx].position);
		// 	});
		// });

		this.table.order([4, "desc"]).draw(false);

		let content;
		this.table
			.column(0)
			.nodes()
			.each((cell, i) => {
				content = i + 1;
				if (isTotal) {
					if (i == 0) content = "<span class='medal'>🏆</span>";
					else if (i == 1) content = "<span class='medal'>🥈</span>";
					else if (i == 2) content = "<span class='medal'>🥉</span>";
				}

				cell.innerHTML = content;
			});

		// Restore columns visibility
		this.table.columns().visible(true);
		this.toTop(".dataTables_scrollBody");
	}

	scroller(elem) {
		const div = $(elem);

		const loop = () => {
			if (!this.isScrolling) return;
			div.stop().animate({ scrollTop: div[0].scrollHeight }, (div[0].scrollHeight - div.scrollTop() - 84) * this.speed, "linear", () => {
				setTimeout(() => {
					div.stop().animate({ scrollTop: 0 }, 1000, "swing", () => {
						setTimeout(() => {
							loop();
						}, 3000);
					});
				}, 1000);
			});
		};
		loop();
	}

	toTop(elem) {
		this.stop(elem);
		setTimeout(() => {
			this.scroller(elem);
		}, 3000);
	}

	stop(elem) {
		$(elem).stop();
	}

	setColVis() {
		if (this.isMultiGuess) {
			this.table.columns([0, 2, 3, 4]).visible(false);
		} else {
			this.columnState.forEach((column) => {
				this.table.column(column.column).visible(column.state);
			});
		}
	}

	getPosition() {
		return {
			top: this.scoreboard.position().top,
			left: this.scoreboard.position().left,
			width: this.scoreboard.width(),
			height: this.scoreboard.height(),
		};
	}

	setPosition(position) {
		return (this.position = position);
	}

	setTitle(title) {
		return this.title.text(title);
	}
	/**
	 * @param {string|null} text
	 */
	#setHint(text) {
		this.scoreboard.toggleClass("is-hint-visible", !!text);
		this.scoreboard.find(".scoreboardHint").text(text || "");
	}

	showSwitch(state) {
		return this.switchContainer.css("display", state ? "block" : "none");
	}

	/**
	 * @param {boolean} state
	 */
	switchOn(state) {
		return this.switchBtn.prop("checked", state);
	}

	/**
	 * @param {number} distance
	 */
	toMeter(distance) {
		return distance >= 1 ? distance.toFixed(1) + "km" : Math.floor(distance * 1000) + "m";
	}
}

module.exports = Scoreboard;
