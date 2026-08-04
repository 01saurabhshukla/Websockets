const Logger = require('../logger/Logger');

const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6]             // Diagonals
];

class TicTacToeGame {
    constructor() {
        this.reset();
    }

    reset() {
        this.board = Array(9).fill(null);
        this.turn = 'X';
        this.winner = null;
        this.status = 'in_progress';
    }

    makeMove(mark, index) {
        if (this.status === 'finished') {
            return { ok: false, error: 'Game is already finished' };
        }

        if (mark !== this.turn) {
            return { ok: false, error: `Not ${mark}'s turn` };
        }

        if (!Number.isInteger(index) || index < 0 || index > 8) {
            return { ok: false, error: 'Invalid cell index' };
        }

        if (this.board[index] !== null) {
            return { ok: false, error: 'Cell is already occupied' };
        }

        this.board[index] = mark;
        Logger.debug('TicTacToe move applied', { mark, index });

        this._checkWinner();

        if (this.status !== 'finished') {
            this.turn = this.turn === 'X' ? 'O' : 'X';
        }

        return { ok: true };
    }

    _checkWinner() {
        for (const [a, b, c] of WIN_LINES) {
            if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
                this.winner = this.board[a];
                this.status = 'finished';
                Logger.info('TicTacToe match won', { winner: this.winner });
                return;
            }
        }

        if (this.board.every(cell => cell !== null)) {
            this.winner = 'draw';
            this.status = 'finished';
            Logger.info('TicTacToe match ended in a draw');
        }
    }

    getState() {
        return {
            board: [...this.board],
            turn: this.turn,
            winner: this.winner,
            status: this.status
        };
    }
}

module.exports = TicTacToeGame;
