'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const TicTacToeGame = require('../games/TicTacToeGame');

describe('TicTacToeGame Unit Tests', () => {

    it('initializes with an empty board and turn X', () => {
        const game = new TicTacToeGame();
        const state = game.getState();

        assert.deepStrictEqual(state.board, Array(9).fill(null));
        assert.strictEqual(state.turn, 'X');
        assert.strictEqual(state.winner, null);
        assert.strictEqual(state.status, 'in_progress');
    });

    it('applies a valid move and flips turn', () => {
        const game = new TicTacToeGame();
        const res1 = game.makeMove('X', 0);

        assert.strictEqual(res1.ok, true);
        assert.strictEqual(game.getState().board[0], 'X');
        assert.strictEqual(game.getState().turn, 'O');

        const res2 = game.makeMove('O', 4);
        assert.strictEqual(res2.ok, true);
        assert.strictEqual(game.getState().board[4], 'O');
        assert.strictEqual(game.getState().turn, 'X');
    });

    it('rejects moves on occupied cells', () => {
        const game = new TicTacToeGame();
        game.makeMove('X', 0);
        const res = game.makeMove('O', 0);

        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.error, 'Cell is already occupied');
        assert.strictEqual(game.getState().turn, 'O');
    });

    it('rejects moves when it is not player\'s turn', () => {
        const game = new TicTacToeGame();
        const res = game.makeMove('O', 0);

        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.error, "Not O's turn");
        assert.strictEqual(game.getState().board[0], null);
    });

    it('rejects invalid cell indices', () => {
        const game = new TicTacToeGame();
        assert.strictEqual(game.makeMove('X', -1).ok, false);
        assert.strictEqual(game.makeMove('X', 9).ok, false);
        assert.strictEqual(game.makeMove('X', '0').ok, false);
    });

    it('detects row, column, and diagonal wins', () => {
        // Row win for X: [0, 1, 2]
        const gameRow = new TicTacToeGame();
        gameRow.makeMove('X', 0); // X
        gameRow.makeMove('O', 3); // O
        gameRow.makeMove('X', 1); // X
        gameRow.makeMove('O', 4); // O
        gameRow.makeMove('X', 2); // X wins!

        assert.strictEqual(gameRow.getState().winner, 'X');
        assert.strictEqual(gameRow.getState().status, 'finished');

        // Diagonal win for O: [2, 4, 6]
        const gameDiag = new TicTacToeGame();
        gameDiag.makeMove('X', 0); // X
        gameDiag.makeMove('O', 2); // O
        gameDiag.makeMove('X', 1); // X
        gameDiag.makeMove('O', 4); // O
        gameDiag.makeMove('X', 8); // X
        gameDiag.makeMove('O', 6); // O wins!

        assert.strictEqual(gameDiag.getState().winner, 'O');
        assert.strictEqual(gameDiag.getState().status, 'finished');
    });

    it('detects a draw when board is full with no winner', () => {
        const game = new TicTacToeGame();
        // X O X
        // X X O
        // O X O
        const moves = [
            ['X', 0], ['O', 1], ['X', 2],
            ['O', 5], ['X', 3], ['O', 6],
            ['X', 4], ['O', 8], ['X', 7]
        ];

        moves.forEach(([mark, idx]) => {
            const res = game.makeMove(mark, idx);
            assert.strictEqual(res.ok, true);
        });

        assert.strictEqual(game.getState().winner, 'draw');
        assert.strictEqual(game.getState().status, 'finished');
    });

    it('rejects moves after game is finished', () => {
        const game = new TicTacToeGame();
        game.makeMove('X', 0);
        game.makeMove('O', 3);
        game.makeMove('X', 1);
        game.makeMove('O', 4);
        game.makeMove('X', 2); // X wins

        const res = game.makeMove('O', 5);
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.error, 'Game is already finished');
    });

    it('resets game state cleanly', () => {
        const game = new TicTacToeGame();
        game.makeMove('X', 0);
        game.reset();

        const state = game.getState();
        assert.deepStrictEqual(state.board, Array(9).fill(null));
        assert.strictEqual(state.turn, 'X');
        assert.strictEqual(state.winner, null);
        assert.strictEqual(state.status, 'in_progress');
    });

});
