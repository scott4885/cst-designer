# Multi-Column Template Pattern Extraction

Source: Schedule Template Examples Dr Multi Column.xlsx — 6 real-practice templates

## Sheet overview
- `Monday 12.25 SMILE NM` (84 rows × 30 cols)
- `Tuesday 12.25 SMILE NM` (84 rows × 30 cols)
- `Wednesday 12.25 SMILE NM` (84 rows × 30 cols)
- `Thursday 12.25 SMILE NM` (84 rows × 30 cols)
- `Friday 12.25 SMILE NM` (83 rows × 31 cols)
- `Monday 1.26 Smile Cascade` (84 rows × 24 cols)

## Monday 12.25 SMILE NM — Grid

Two doctors (Hall=Rooms 1+2, Borst=Rooms 3+4) + 3 hygienists. Each op = status column + label column.

```
Time | R1.S | Room1 Block  | R2.S | Room2 Block  | R3.S | Room3 Block  | R4.S | Room4 Block  | H2.S | HYG2 Block   | H3.S | HYG3 Block   | H4.S | HYG4 Block   |
-----+------+--------------+------+--------------+------+--------------+------+--------------+------+--------------+------+--------------+------+--------------+
 8:00 |    A | HP > $1800   |      |              |    A | MP           |      |              |    H | PM/GING>$150 |    H | RC/PM > $130 |    H | RC/PM > $130
 8:10 |    A |              |      |              |    D |              |      |              |    H |              |    D |              |    H |             
 8:20 |    D |              |      |              |    D |              |      |              |    H |              |    H |              |    H |             
 8:30 |    D |              |      |              |    A |              |    A | ER           |    H |              |    H |              |    D |             
 8:40 |    D |              |      |              |      |              |    D |              |    H |              |    H |              |    H |             
 8:50 |    D |              |      |              |      |              |    A |              |    H |              |    H |              |    H |             
 9:00 |    A |              |    A | NON-PROD     |    A | HP > $1800   |      |              |    H | RC/PM > $130 |    H | RC/PM > $130 |    H | RC/PM > $130
 9:10 |    A |              |    A |              |    A |              |      |              |    D |              |    D |              |    H |             
 9:20 |    A | MP           |    A |              |    D |              |      |              |    H |              |    H |              |    H |             
 9:30 |    D |              |      |              |    D |              |      |              |    H |              |    H |              |    H |             
 9:40 |    D |              |      |              |    D |              |      |              |    H |              |    H |              |    D |             
 9:50 |    A |              |      |              |    D |              |      |              |    H |              |    H |              |    H |             
10:00 |      |              |    A | HP > $1800   |    A |              |      |              |    H | NP>$300      |    H | PM/GING>$150 |    H | SRP>$400    
10:10 |      |              |    A |              |    A |              |      |              |    H |              |    H |              |    H |             
10:20 |      |              |    D |              |    A |              |    A | HP > $1800   |    H |              |    H |              |    H |             
10:30 |      |              |    D |              |    D |              |    A |              |    H |              |    H |              |    H |             
10:40 |      |              |    D |              |    A |              |    D |              |    H |              |    H |              |    H |             
10:50 |      |              |    D |              |    A |              |    D |              |    D |              |    H |              |    H |             
11:00 |    A | HP > $1800   |    A |              |      |              |    D |              |    D |              |    H | RC/PM > $130 |    H | PM/GING>$150
11:10 |    A |              |    A |              |      |              |    A |              |    D |              |    H |              |    H |             
11:20 |    D |              |      |              |      |              |    A |              |    H |              |    D |              |    H |             
11:30 |    D |              |      |              |      |              |    A |              |    H | NP>$300      |    H |              |    H |             
11:40 |    D |              |      |              |    A | HP > $1800   |    D |              |    H |              |    H |              |    H |             
11:50 |    D |              |      |              |    A |              |    D |              |    H |              |    H |              |    H |             
12:00 |    A |              |    A | ER           |    D |              |    A |              |    D |              |    H | RC/PM > $130 |    H | RC/PM > $130
12:10 |    A |              |    D |              |    D |              |    A |              |    D |              |    H |              |    H |             
12:20 |    A | MP           |    A |              |    D |              |      |              |    D |              |    D |              |    H |             
12:30 |    D |              |      |              |    D |              |      |              |    H |              |    H |              |    H |             
12:40 |    D |              |      |              |    A |              |      |              |    H |              |    H |              |    D |             
12:50 |    A |              |      |              |    A |              |      |              |    H |              |    H |              |    H |             
 1:00 | LUNCH |              |      |              |      |              |      |              |      |              |      |              |      |             
 1:10 |      |              |      |              |      |              |      |              |      |              |      |              |      |             
 1:20 |      |              |      |              |      |              |      |              |      |              |      |              |      |             
 1:30 |      |              |      |              |      |              |      |              |      |              |      |              |      |             
 1:40 |      |              |      |              |      |              |      |              |      |              |      |              |      |             
 1:50 |      |              |      |              |      |              |      |              |      |              |      |              |      |             
 2:00 |    A | HP > $1800   |    A | ER           |    A | MP           |      |              |    H | SRP>$400     |    H | RC/PM > $130 |    D | RC/PM > $130
 2:10 |    A |              |    D |              |    D |              |      |              |    H |              |    H |              |    H |             
 2:20 |    D |              |    A |              |    D |              |      |              |    H |              |    H |              |    H |             
 2:30 |    D |              |      |              |    A |              |    A | NON-PROD     |    H |              |    H |              |    H |             
 2:40 |    D |              |      |              |      |              |    A |              |    H |              |    H |              |    H |             
 2:50 |    D |              |      |              |      |              |    A |              |    H |              |    D |              |    H |             
 3:00 |    A |              |      |              |      |              |    A | ER           |    H | PM/GING>$150 |    H | RC/PM > $130 |    H | PM/GING>$150
 3:10 |    A |              |    A | NON-PROD     |    A | HP > $1800   |    D |              |    H |              |    H |              |    H |             
 3:20 |      |              |    A |              |    A |              |    A |              |    H |              |    H |              |    H |             
 3:30 |      |              |    A |              |    D |              |      |              |    H |              |    H |              |    H |             
 3:40 |    A | MP           |      |              |    D |              |      |              |    H |              |    H |              |    H |             
 3:50 |    D |              |      |              |    D |              |      |              |    H |              |    D |              |    H |             
 4:00 |    D |              |      |              |    D |              |      |              |    H | RC/PM > $130 |    H | PM/GING>$150 |    H | RC/PM > $130
 4:10 |    A |              |      |              |    A |              |      |              |    D |              |    H |              |    H |             
 4:20 |    A | MP           |      |              |    A |              |    A | MP           |    H |              |    H |              |    D |             
 4:30 |    D |              |      |              |      |              |    D |              |    H |              |    H |              |    H |             
 4:40 |    D |              |      |              |      |              |    D |              |    H |              |    H |              |    H |             
 4:50 |    A |              |      |              |      |              |    A |              |    H |              |    H |              |    H |             
```

## Extracted Block Patterns (A/D/H sequences by block type)

| Block Type | Most Common Pattern | Duration | Observed Variants |
|---|---|---|---|
| ER | `A-D-A` | 30 min | A-D-A (18x) |
| HP > $1800 | `A-A-D-D-D-D-A-A` | 80 min | A-A-D-D-D-D-A-A (28x); A-A-D-D-D-D-A-A-A-D-A-A (5x); A-A-A-D-D-D-D-D-A-A-A-D-LUNCH (2x); A-A-D-D-D-A-A-A-D-D-A-A (1x) |
| MP | `A-D-D-A` | 40 min | A-D-D-A (24x); A-D-D-A-LUNCH (2x); A-A-D-D-D-A (1x) |
| MP  | `A-D-D-A` | 40 min | A-D-D-A (1x) |
| NON-PROD | `A-A-A` | 30 min | A-A-A (16x) |
| NP>$300 | `H-H-H-H-H-D-D-D-H` | 90 min | H-H-H-H-H-D-D-D-H (7x); H-H-H-D-D-D-H-H-H (1x) |
| PM/GING>$150 | `H-H-H-H-H-H` | 60 min | H-H-H-H-H-H (23x) |
| RC/PM > $130 | `H-D-H-H-H-H` | 60 min | H-D-H-H-H-H (24x); H-H-D-H-H-H (13x); H-H-H-D-H-H (8x); D-H-H-H-H-H (8x) |
| SRP>$400 | `H-H-H-H-H-H` | 60 min | H-H-H-H-H-H (9x) |

## Practice Config (SMILE NM Monday)

- Dr Hall — 2 cols (Dr Room 1, 2), daily goal $10000, $7200 minimum
- Dr Borst — 2 cols (Dr Room 3, 4), daily goal $8000, $7200 minimum
- 3 RDHs, each 1 col, daily goals ~$1700-$2200
- Need/day: 4 NP blocks, 2 SRP blocks
- Hours: 7:00 AM – 5:00 PM
- 10-min increments
- Lunch: 1:00–2:00 PM (60 min)

## Monday 1.26 Smile Cascade — alt configuration

- 1 doctor (Fitzpatrick) with 2 ops (OP8/OP9), goal $5000
- 3 hygienists (OP1, OP2, plus one more)
- Need/day: 1 NP block, 1 SRP block
- 8:00 AM – 5:00 PM
- Provider colors in row 16: DR1=orange ec8a1b, HYG2=blue 87bcf3, HYG4=yellow f4de37, HYG3=teal 44f2ce
