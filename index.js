import WebSocket, { WebSocketServer } from "ws";
import crypto from "crypto";
import fs from "node:fs";
import { resolve } from "node:path";

const wss = new WebSocketServer({ port: 8080 });

const files = fs.readdirSync("./cards");

const rooms = [];

const cardToBase64 = async (card) => {
  return new Promise((resolve, reject) => {
    fs.readFile(`./cards/${card}`, "base64", (err, data) => {
      if (err) {
        console.error(err);
        reject(err);
      }
      resolve(data);
    });
  });
};

wss.on("connection", (ws) => {
  ws.on("error", console.error);

  // wss.clients.forEach((client) => {
  //   if (client.readyState === WebSocket.OPEN && client === ws) {
  //     client.send("Benvenuto!");
  //   }
  // });

  ws.on("message", async (msg) => {
    const dataReceived = JSON.parse(msg.toString());
    let room;
    let indexOfPlayer;

    if (rooms.length !== 0) {
      room = rooms.find((room) =>
        room.players.find((player) => player.client === ws)
      );
    }

    if (room) {
      indexOfPlayer = room.players.indexOf(
        room.players.find((p) => p.client === ws)
      );
    }

    switch (dataReceived.cmd) {
      case "NEW": {
        try {
          const player = {
            name: dataReceived.player,
            avatar: ``,
            hand: { cards: [], cardsName: [] },
            client: ws,
          };
          const room = {
            id: rooms.length + 1,
            token: crypto.randomUUID().toUpperCase(),
            players: [player],
            deck: [],
            usedCards: [],
            inStockCards: [],
          };

          rooms.push(room);

          ws.send(JSON.stringify({ token: room.token }));
        } catch (err) {
          console.error(err);
        }
        break;
      }
      case "JOIN": {
        try {
          const player = {
            name: dataReceived.player,
            avatar: ``,
            hand: { cards: [], cardsName: [] },
            client: ws,
          };

          const room = rooms.find((room) => room.token === dataReceived.token);

          if (room) {
            room.players.push(player);
          }

          ws.send(JSON.stringify({ players: room.players }));
        } catch (err) {
          console.error(err);
        }
        break;
      }
      case "QUIT": {
        try {
          room.players.splice(indexOfPlayer, 1);

          wss.clients.forEach((client) => {
            const player = room.players.find((p) => p.client === client);

            client.send(
              JSON.stringify({
                players: { name: player.name, avatar: player.avatar },
              })
            );
          });
        } catch (err) {
          console.error(err);
        }
        break;
      }
      case "START": {
        try {
          const deck = [...files, ...files];

          //distribuzione carte ai giocatori
          for (let iPlayer = 0; iPlayer < room.players.length; iPlayer++) {
            for (let iCard = 0; iCard < 4; iCard++) {
              const randomCard = Math.floor(Math.random() * deck.length);
              const cardIndex = deck.indexOf(deck[randomCard]);

              const c = await cardToBase64(deck[randomCard]);

              room.players[iPlayer].hand.cards.push(c);
              room.players[iPlayer].hand.cardsName.push(deck[randomCard]);
              deck.splice(deck[cardIndex], 1);
            }

            wss.clients.forEach((client) => {
              if (
                client.readyState === WebSocket.OPEN &&
                client === room.players[iPlayer].client
              ) {
                client.send(
                  JSON.stringify({
                    cards: room.players[iPlayer].hand.cards,
                    cardsName: room.players[iPlayer].hand.cardsName,
                  })
                );
              }
            });
          }

          //mix del mazzo
          for (let index = 0; index < deck.length; index++) {
            const randomCard = Math.floor(Math.random() * deck.length);
            const cardIndex = deck.indexOf(deck[randomCard]);

            deck.splice(deck[cardIndex], 1);
            room.deck.push(deck[randomCard]);
          }
        } catch (err) {
          console.error(err);
        }
        break;
      }
      case "THROW A CARD": {
        try {
          if (room.players[indexOfPlayer].hand.cardsName.length === 4) {
            room.players[indexOfPlayer].hand.cards.splice(
              dataReceived.cardIndex,
              1
            );
            room.players[indexOfPlayer].hand.cardsName.splice(
              dataReceived.cardIndex,
              1
            );

            room.usedCards.push(dataReceived.card);

            ws.send(
              JSON.stringify({
                cards: room.players[indexOfPlayer].hand.cards,
                cardsName: room.players[indexOfPlayer].hand.cardsName,
              })
            );
          } else {
            throw new Error("the player has already played");
          }
        } catch (err) {
          console.log(err);
        }
        break;
      }
      case "DRAW FROM DECK": {
        try {
          const c = await cardToBase64(room.deck[room.deck.length - 1]);

          if (
            room.players[indexOfPlayer].hand.cards.length < 4 &&
            room.deck.length > 0
          ) {
            room.players[indexOfPlayer].hand.cards.push(c);
            room.players[indexOfPlayer].hand.cardsName.push(
              room.deck[room.deck.length - 1]
            );
            room.deck.pop();

            ws.send(
              JSON.stringify({
                cards: room.players[indexOfPlayer].hand.cards,
                cardsName: room.players[indexOfPlayer].hand.cardsName,
              })
            );
          } else {
            throw new Error(
              "the player has not played the card or has already drawn it"
            );
          }
        } catch (err) {
          console.error(err);
        }
        break;
      }
      case "SAVE IN STOCK": {
        try {
          if (room.players[indexOfPlayer].hand.cardsName.length === 4) {
            if (
              dataReceived.card.startsWith("re_") ||
              dataReceived.card.startsWith("asso") ||
              dataReceived.card.startsWith("4") ||
              dataReceived.card.startsWith("7") ||
              dataReceived.card.startsWith("jolly")
            ) {
              room.players[indexOfPlayer].hand.cards.splice(
                dataReceived.cardIndex,
                1
              );
              room.players[indexOfPlayer].hand.cardsName.splice(
                dataReceived.cardIndex,
                1
              );

              room.inStockCards.push(dataReceived.card);

              ws.send(
                JSON.stringify({
                  cards: room.players[indexOfPlayer].hand.cards,
                  cardsName: room.players[indexOfPlayer].hand.cardsName,
                })
              );
            }
          } else {
            throw new Error("the player has already played");
          }

          console.log(room.inStockCards);
        } catch (err) {
          console.error(err);
        }
        break;
      }
      case "DRAW FROM STOCK": {
        try {
          const c = await cardToBase64(
            room.inStockCards[room.inStockCards.length - 1]
          );

          if (
            room.players[indexOfPlayer].hand.cards.length < 4 &&
            room.inStockCards.length > 0
          ) {
            room.players[indexOfPlayer].hand.cards.push(c);
            room.players[indexOfPlayer].hand.cardsName.push(
              room.inStockCards[room.inStockCards.length - 1]
            );

            room.inStockCards.pop();

            ws.send(
              JSON.stringify({
                cards: room.players[indexOfPlayer].hand.cards,
                cardsName: room.players[indexOfPlayer].hand.cardsName,
              })
            );
          } else {
            throw new Error(
              "the player has not played the card or has already drawn it"
            );
          }
        } catch (err) {
          console.error(err);
        }
        break;
      }
      case "FIRE": {
      }
      case "END": {
      }
      default: {
        console.log(msg.toString());
      }
    }
  });

  ws.on("close", () => {
    console.log(`clients: ${JSON.stringify(wss.clients.size)}`);
  });

  console.log(`clients: ${JSON.stringify(wss.clients.size)}`);
});
