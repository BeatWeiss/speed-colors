const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

// Farb-Definitionen für das Spiel
const FARBEN = [
    { id: 'rot', name: 'ROT', hex: '#ff4757' },
    { id: 'blau', name: 'BLAU', hex: '#1e90ff' },
    { id: 'gruen', name: 'GRÜN', hex: '#2ed573' },
    { id: 'gelb', name: 'GELB', hex: '#ffa502' }
];

let room = {
    players: [],        // { id, name, score }
    active: false,      // Läuft das Spiel?
    zielFarbe: null,    // Die Farbe, die gedrückt werden muss
    rundenAktiv: false, // Darf im Moment gedrückt werden?
    log: "Warten auf Spieler...",
    winner: null
};

let rundenTimer = null;

app.get('/', (req, res) => {
    res.send(`
		<!DOCTYPE html>
		<html lang="de">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
			<title>Speed Colors - Special Effects Edition</title>
			<script src="/socket.io/socket.io.js"></script>
			<style>
				body { font-family: 'Segoe UI', Arial, sans-serif; background: #1e1e24; color: #fff; text-align: center; margin: 0; padding: 20px; user-select: none; transition: background-color 0.15s ease; }
				.container { max-width: 500px; margin: 0 auto; background: #2a2a35; padding: 20px; border-radius: 15px; box-shadow: 0 8px 16px rgba(0,0,0,0.3); }
				h1 { color: #ffa502; margin-bottom: 5px; }
				
				/* Buttons & Inputs */
				button.main-btn { background: #ffa502; color: #1e1e24; border: none; padding: 12px 24px; font-size: 16px; font-weight: bold; border-radius: 8px; cursor: pointer; margin: 10px 0; width: 100%; }
				input { padding: 12px; font-size: 16px; border-radius: 8px; border: 2px solid #555; background: #222; color: #fff; width: calc(100% - 28px); text-align: center; margin-bottom: 10px; }
				
				/* Listen */
				.player-list { list-style: none; padding: 0; margin: 20px 0; }
				.player-item { padding: 10px; margin: 5px 0; background: #383845; border-radius: 6px; display: flex; justify-content: space-between; font-size: 18px; }
				
				/* Spielfeld mit Pop-Animation */
				.target-display { height: 120px; line-height: 120px; font-size: 40px; font-weight: bold; border-radius: 10px; margin: 20px 0; background: #383845; text-shadow: 2px 2px 4px rgba(0,0,0,0.6); transition: background 0.1s ease; }
				.pop-effect { animation: pop 0.2s ease-out; }
				
				@keyframes pop {
					0% { transform: scale(0.9); }
					50% { transform: scale(1.05); }
					100% { transform: scale(1); }
				}
				
				/* Das 2x2 Farb-Raster für die Spieler */
				.color-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 20px; }
				.color-btn { height: 120px; border: none; border-radius: 12px; font-size: 24px; font-weight: bold; color: white; text-shadow: 1px 1px 3px rgba(0,0,0,0.8); cursor: pointer; transition: transform 0.05s ease; -webkit-tap-highlight-color: transparent; }
				.color-btn:active { transform: scale(0.92); }
				
				/* Roter Blitz-Effekt bei Fehler */
				.wrong-flash { background-color: #781d24 !important; }
				
				.log { background: #111; padding: 12px; border-radius: 6px; font-size: 16px; color: #2ed573; min-height: 24px; margin-bottom: 15px; }
				.hidden { display: none; }
			</style>
		</head>
		<body>
			<div class="container">
				<h1>⚡ Speed Colors</h1>
				<p style="color: #ff4757; margin-top: 0; font-weight: bold;">⚡ SPECIAL EFFECTS EDITION ⚡</p>

				<!-- LOBBY -->
				<div id="lobbyScreen">
					<input type="text" id="nameInput" placeholder="Dein Name" maxlength="12"><br>
					<button class="main-btn" id="joinBtn" onclick="joinGame()">Spiel beitreten</button>
					<div id="hostArea" class="hidden">
						<p style="color: #2ed573; font-weight: bold;">Du bist der Host!</p>
						<button class="main-btn" onclick="startGame()" style="background: #2ed573; color: white;">Spiel starten</button>
					</div>
					<h3>Mitspieler:</h3>
					<ul id="lobbyList" class="player-list"></ul>
				</div>

				<!-- GAME SCREEN -->
				<div id="gameScreen" class="hidden">
					<div class="log" id="gameLog">Warten auf die nächste Farbe...</div>
					
					<!-- Das Feld, das alle gleichzeitig sehen -->
					<div class="target-display" id="targetView">BEREIT...</div>
					
					<!-- Die 4 farbigen Knöpfe für jeden Spieler -->
					<div class="color-grid">
						<button class="color-btn" style="background: #ff4757;" onclick="pressColor('rot')">ROT</button>
						<button class="color-btn" style="background: #1e90ff;" onclick="pressColor('blau')">BLAU</button>
						<button class="color-btn" style="background: #2ed573;" onclick="pressColor('gruen')">GRÜN</button>
						<button class="color-btn" style="background: #ffa502;" onclick="pressColor('gelb')">GELB</button>
					</div>

					<h3>Punktestand (Ziel: 10 Punkte):</h3>
					<ul id="gamePlayerList" class="player-list"></ul>
				</div>
			</div>

			<script>
				const socket = io();
				let myName = "";
				let aktuellerFarbId = "";

				function joinGame() {
					const name = document.getElementById('nameInput').value.trim();
					if(!name) return alert("Bitte gib einen Namen ein!");
					myName = name;
					socket.emit('joinRoom', name);
					document.getElementById('nameInput').classList.add('hidden');
					document.getElementById('joinBtn').classList.add('hidden');
				}

				function startGame() {
					socket.emit('requestStart');
				}

				function pressColor(colorId) {
					if (colorId !== aktuellerFarbId) {
						triggerWrongEffects();
					}
					socket.emit('actionPress', colorId);
				}

				function triggerWrongEffects() {
					document.body.classList.add('wrong-flash');
					if (navigator.vibrate) navigator.vibrate(300);
					setTimeout(() => {
						document.body.classList.remove('wrong-flash');
					}, 150);
				}

				socket.on('roomUpdate', (data) => {
					const lobbyList = document.getElementById('lobbyList');
					lobbyList.innerHTML = data.players.map(p => \`<li class="player-item"><span>\${p.name}</span> <span>\${p.score} Pkt.</span></li>\`).join('');

					if(data.players.length > 0 && data.players[0].id === socket.id && !data.active) {
						document.getElementById('hostArea').classList.remove('hidden');
					}

					if(data.active) {
						document.getElementById('lobbyScreen').classList.add('hidden');
						document.getElementById('gameScreen').classList.remove('hidden');
						
						document.getElementById('gameLog').innerText = data.log;
						
						const targetView = document.getElementById('targetView');
						let vorherigeFarbe = aktuellerFarbId;
						
						if (data.rundenAktiv && data.zielFarbe) {
							aktuellerFarbId = data.zielFarbe.id;
							targetView.innerText = data.zielFarbe.name;
							targetView.style.background = data.zielFarbe.hex;
							
							if(vorherigeFarbe !== aktuellerFarbId) {
								targetView.classList.remove('pop-effect');
								void targetView.offsetWidth;
								targetView.classList.add('pop-effect');
							}
						} else {
							aktuellerFarbId = "";
							targetView.innerText = data.winner ? "ENDE!" : "ACHTUNG...";
							targetView.style.background = "#383845";
							targetView.classList.remove('pop-effect');
						}

						const gamePlayerList = document.getElementById('gamePlayerList');
						const sortierteSpieler = [...data.players].sort((a,b) => b.score - a.score);
						gamePlayerList.innerHTML = sortierteSpieler.map(p => \`
							<li class="player-item">
								<span>\${p.name}</span>
								<strong style="color: \${p.score < 0 ? '#ff4757' : '#fff'}">\${p.score} / 10 Pkt.</strong>
							</li>
						\`).join('');
					}
				});

				socket.on('successFeedback', () => {
					if (navigator.vibrate) navigator.vibrate([80]);
				});

				socket.on('err', (msg) => alert(msg));
			</script>
		</body>
		</html>
    `);
});

// SERVER LOGIK 
io.on('connection', (socket) => {
	socket.on('joinRoom', (name) => {
		if(room.active) return socket.emit('err', 'Das Spiel läuft bereits!');
		if(room.players.length >= 6) return socket.emit('err', 'Raum voll (max 6 Spieler)!');
		
		room.players.push({ id: socket.id, name: name, score: 0 });
		io.emit('roomUpdate', room);
	});
		
	socket.on('requestStart', () => {		
		if(room.players.length < 2) return socket.emit('err', 'Es werden mindestens 2 Spieler benötigt!');
		if(room.players[0].id !== socket.id) return socket.emit('err', 'Nur der Host kann starten.');
		
		room.active = true;
		room.winner = null;
		room.players.forEach(p => p.score = 0);
		room.log = "Das Spiel beginnt! Gleich geht's los...";
		io.emit('roomUpdate', room);
		starteNaechstenBlitz();
	});
		
	socket.on('actionPress', (colorId) => {
		if (!room.rundenAktiv || room.winner) return;
	
		const spieler = room.players.find(p => p.id === socket.id);
		if (!spieler) return;
		
		if (colorId === room.zielFarbe.id)	{
			room.rundenAktiv = false;
			spieler.score += 1;
			room.log = `⚡ ${spieler.name} war am schnellsten! (+1 Punkt)`;
			
			socket.emit('successFeedback');
			if (spieler.score >= 10) {
				room.winner = spieler.name;
				room.log = `👑 ${spieler.name} GEWINNT DAS SPIEL! 👑`;
			
				io.emit('roomUpdate', room);
				setTimeout(() => { 
					room.active = false; 
					io.emit('roomUpdate', room); 		
				}, 5000);
			} else {
				io.emit('roomUpdate', room);
				starteNaechstenBlitz();
			}
		} else {
			spieler.score -= 1;
			room.log = `❌ ${spieler.name} hat falsch gedrückt! (-1 Punkt)`;
			io.emit('roomUpdate', room);
		}
	});
		
	socket.on('disconnect', () => {
		const index = room.players.findIndex(p => p.id === socket.id);
		if(index !== -1) {
			room.log = `${room.players[index].name} hat das Spiel verlassen.`;
			room.players.splice(index, 1);
			
			if(room.players.length < 2) {
				room.active = false;
				clearTimeout(rundenTimer);
			}
			io.emit('roomUpdate', room);
		}
	});
});
			
function starteNaechstenBlitz() {
	room.rundenAktiv = false;
	room.zielFarbe = null;
	const verzoegerung = Math.floor(Math.random() * 3000) + 2000;
	rundenTimer = setTimeout(() => {
		if (!room.active || room.winner) return;
		const zufallsIndex = Math.floor(Math.random() * FARBEN.length);
		room.zielFarbe = FARBEN[zufallsIndex];
		room.rundenAktiv = true;
		room.log = "JETZT DRÜCKEN!";
		io.emit('roomUpdate', room);
	}, verzoegerung);
}

http.listen(PORT, '0.0.0.0', () => {
	console.log(Spiel-Server läuft auf Port ${PORT});
	}
);
