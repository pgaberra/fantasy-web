import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Player } from '../models/player.model';

@Injectable({
  providedIn: 'root',
})
export class PlayerService {
  private mockPlayers: Player[] = [
    { id: 1,  name: 'Connor McDavid',    positions: new Set(['C']),        stats: { utility: { gp: 82, toiPerGame: 1320 }, scoring: { goals: 64, assists: 89,  plusMinus: 33, pim: 36, ppg: 22, ppa: 38, shg: 1, sha: 0, gwg: 8, sog: 348, shPct: 18.4, fw: 812,  fl: 623, hits: 42, blocks: 28  } } },
    { id: 2,  name: 'Nathan MacKinnon',  positions: new Set(['C']),        stats: { utility: { gp: 79, toiPerGame: 1305 }, scoring: { goals: 51, assists: 83,  plusMinus: 28, pim: 44, ppg: 19, ppa: 31, shg: 0, sha: 1, gwg: 7, sog: 312, shPct: 16.3, fw: 734,  fl: 581, hits: 65, blocks: 35  } } },
    { id: 3,  name: 'Auston Matthews',   positions: new Set(['C']),        stats: { utility: { gp: 81, toiPerGame: 1230 }, scoring: { goals: 69, assists: 54,  plusMinus: 21, pim: 30, ppg: 24, ppa: 18, shg: 2, sha: 0, gwg: 9, sog: 371, shPct: 18.6, fw: 489,  fl: 392, hits: 38, blocks: 22  } } },
    { id: 4,  name: 'Leon Draisaitl',    positions: new Set(['C', 'LW']),  stats: { utility: { gp: 80, toiPerGame: 1260 }, scoring: { goals: 52, assists: 76,  plusMinus: 18, pim: 58, ppg: 21, ppa: 34, shg: 1, sha: 2, gwg: 6, sog: 298, shPct: 17.4, fw: 367,  fl: 298, hits: 51, blocks: 19  } } },
    { id: 5,  name: 'David Pastrnak',    positions: new Set(['RW']),       stats: { utility: { gp: 82, toiPerGame: 1170 }, scoring: { goals: 61, assists: 68,  plusMinus: 24, pim: 42, ppg: 25, ppa: 27, shg: 0, sha: 0, gwg: 8, sog: 334, shPct: 18.3, fw: 201,  fl: 178, hits: 44, blocks: 31  } } },
    { id: 6,  name: 'Nikita Kucherov',   positions: new Set(['RW']),       stats: { utility: { gp: 76, toiPerGame: 1275 }, scoring: { goals: 44, assists: 100, plusMinus: 30, pim: 48, ppg: 18, ppa: 42, shg: 0, sha: 1, gwg: 5, sog: 256, shPct: 17.2, fw: 124,  fl: 108, hits: 37, blocks: 25  } } },
    { id: 7,  name: 'Cale Makar',        positions: new Set(['D']),        stats: { utility: { gp: 77, toiPerGame: 1500 }, scoring: { goals: 30, assists: 70,  plusMinus: 35, pim: 28, ppg: 14, ppa: 32, shg: 1, sha: 0, gwg: 4, sog: 278, shPct: 10.8, fw: 0,    fl: 0,   hits: 58, blocks: 142 } } },
    { id: 8,  name: 'Erik Karlsson',     positions: new Set(['D']),        stats: { utility: { gp: 65, toiPerGame: 1470 }, scoring: { goals: 22, assists: 63,  plusMinus: -5, pim: 32, ppg: 11, ppa: 29, shg: 0, sha: 0, gwg: 3, sog: 212, shPct: 10.4, fw: 0,    fl: 0,   hits: 29, blocks: 98  } } },
    { id: 9,  name: 'Roman Josi',        positions: new Set(['D']),        stats: { utility: { gp: 82, toiPerGame: 1485 }, scoring: { goals: 24, assists: 66,  plusMinus: 14, pim: 36, ppg: 12, ppa: 28, shg: 0, sha: 1, gwg: 4, sog: 234, shPct: 10.3, fw: 0,    fl: 0,   hits: 63, blocks: 156 } } },
    { id: 10, name: 'Quinn Hughes',      positions: new Set(['D']),        stats: { utility: { gp: 82, toiPerGame: 1530 }, scoring: { goals: 18, assists: 72,  plusMinus: 22, pim: 22, ppg: 9,  ppa: 31, shg: 0, sha: 0, gwg: 2, sog: 198, shPct: 9.1,  fw: 0,    fl: 0,   hits: 24, blocks: 112 } } },
    { id: 11, name: 'Brayden Point',     positions: new Set(['C']),        stats: { utility: { gp: 82, toiPerGame: 1215 }, scoring: { goals: 51, assists: 63,  plusMinus: 20, pim: 40, ppg: 20, ppa: 22, shg: 3, sha: 1, gwg: 7, sog: 292, shPct: 17.5, fw: 556,  fl: 421, hits: 55, blocks: 41  } } },
    { id: 12, name: 'Jason Robertson',   positions: new Set(['LW', 'RW']), stats: { utility: { gp: 79, toiPerGame: 1185 }, scoring: { goals: 46, assists: 63,  plusMinus: 16, pim: 26, ppg: 17, ppa: 21, shg: 0, sha: 0, gwg: 6, sog: 267, shPct: 17.2, fw: 312,  fl: 256, hits: 39, blocks: 27  } } },
    { id: 13, name: 'Mitch Marner',      positions: new Set(['RW']),       stats: { utility: { gp: 82, toiPerGame: 1200 }, scoring: { goals: 37, assists: 82,  plusMinus: 26, pim: 20, ppg: 13, ppa: 35, shg: 1, sha: 2, gwg: 5, sog: 234, shPct: 15.8, fw: 289,  fl: 234, hits: 31, blocks: 38  } } },
    { id: 14, name: 'Aleksander Barkov', positions: new Set(['C']),        stats: { utility: { gp: 80, toiPerGame: 1290 }, scoring: { goals: 39, assists: 72,  plusMinus: 22, pim: 34, ppg: 14, ppa: 26, shg: 4, sha: 3, gwg: 6, sog: 245, shPct: 15.9, fw: 1102, fl: 712, hits: 48, blocks: 52  } } },
    { id: 15, name: 'Bo Horvat',         positions: new Set(['C']),        stats: { utility: { gp: 82, toiPerGame: 1125 }, scoring: { goals: 44, assists: 48,  plusMinus: 10, pim: 52, ppg: 16, ppa: 14, shg: 2, sha: 1, gwg: 7, sog: 234, shPct: 18.8, fw: 978,  fl: 734, hits: 87, blocks: 44  } } },
    { id: 16, name: 'Kirill Kaprizov',   positions: new Set(['LW']),       stats: { utility: { gp: 81, toiPerGame: 1245 }, scoring: { goals: 55, assists: 64,  plusMinus: 19, pim: 38, ppg: 19, ppa: 24, shg: 0, sha: 0, gwg: 8, sog: 312, shPct: 17.6, fw: 178,  fl: 142, hits: 43, blocks: 29  } } },
    { id: 17, name: 'Sebastian Aho',     positions: new Set(['C', 'LW']),  stats: { utility: { gp: 82, toiPerGame: 1155 }, scoring: { goals: 42, assists: 64,  plusMinus: 12, pim: 44, ppg: 15, ppa: 22, shg: 3, sha: 2, gwg: 5, sog: 263, shPct: 16.0, fw: 634,  fl: 498, hits: 61, blocks: 47  } } },
    { id: 18, name: 'Jake Guentzel',     positions: new Set(['LW']),       stats: { utility: { gp: 78, toiPerGame: 1110 }, scoring: { goals: 44, assists: 49,  plusMinus: 14, pim: 28, ppg: 16, ppa: 18, shg: 1, sha: 0, gwg: 6, sog: 248, shPct: 17.7, fw: 134,  fl: 112, hits: 52, blocks: 33  } } },
    { id: 19, name: 'Mark Scheifele',    positions: new Set(['C']),        stats: { utility: { gp: 80, toiPerGame: 1140 }, scoring: { goals: 38, assists: 61,  plusMinus: 8,  pim: 46, ppg: 14, ppa: 20, shg: 2, sha: 1, gwg: 4, sog: 228, shPct: 16.7, fw: 812,  fl: 634, hits: 46, blocks: 36  } } },
    { id: 20, name: 'Tage Thompson',     positions: new Set(['C']),        stats: { utility: { gp: 82, toiPerGame: 1200 }, scoring: { goals: 47, assists: 55,  plusMinus: 15, pim: 56, ppg: 17, ppa: 19, shg: 1, sha: 0, gwg: 7, sog: 278, shPct: 16.9, fw: 289,  fl: 234, hits: 74, blocks: 39  } } },
  ];

  getPlayers(): Observable<Player[]> {
    return of(this.mockPlayers);
  }
}
