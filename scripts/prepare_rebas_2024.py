#!/usr/bin/env python3
"""Extract a factual, deduplicated *played-in-2024* CPBL player index from Rebas ODC-By data.

This is not a full registered roster: players without a game appearance are absent.
The resulting JSON records their source IDs, on-field appearances, team history and
observed batting/pitching box-score totals. It does not fabricate salary, FA service,
position, birth date or a player's likeness.
"""
import json
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

TEAMS = {
    '中信兄弟': 'brothers', '兄弟': 'brothers', '味全龍': 'dragons',
    '統一7-ELEVEn獅': 'unilions', '統一獅': 'unilions', '統一7-ELEVEn獅隊': 'unilions',
    '富邦悍將': 'guardians', '樂天桃猿': 'rakuten', '台鋼雄鷹': 'TSG', '臺鋼雄鷹': 'TSG',
}

def games_from_json(obj):
    if isinstance(obj, list):
        for part in obj:
            yield from games_from_json(part)
    elif isinstance(obj, dict):
        if 'homeTeam' in obj and 'awayTeam' in obj:
            yield obj
        else:
            for value in obj.values():
                if isinstance(value, (list, dict)):
                    yield from games_from_json(value)

def load_games(path):
    with zipfile.ZipFile(path) as archive:
        names = [n for n in archive.namelist() if re.search(r'(^|/)G\d+\.json$', n, re.I)]
        if not names:
            names = sorted((n for n in archive.namelist() if n.lower().endswith('.json')),
                           key=lambda n:archive.getinfo(n).file_size, reverse=True)[:1]
        if not names:
            raise ValueError('ZIP contains no JSON match data')
        seen = set()
        for name in names:
            for game in games_from_json(json.loads(archive.read(name))):
                key = (str(game.get('date')), str(game.get('seq')),
                       str(game.get('homeTeamId')), str(game.get('awayTeamId')))
                if key in seen:
                    continue
                seen.add(key)
                yield game

def extract(games):
    players = {}
    games_count = 0
    teams_seen = set()
    for game in games:
        games_count += 1
        date = str(game.get('date') or '')
        if date and not date.startswith('2024'):
            continue
        for side in ('home','away'):
            team_name = str(game.get(side+'Team','')).strip()
            team_id = TEAMS.get(team_name)
            if not team_id:
                raise ValueError(f'Unrecognized 2024 team: {team_name!r}')
            teams_seen.add(team_id)
            for kind in ('BatterBox','PitcherBox'):
                is_pitcher = kind=='PitcherBox'
                for box in game.get(side+kind,[]) or []:
                    pid = str(box.get('playerId') or '').strip()
                    name = str(box.get('playerName') or '').strip()
                    if not pid or not name:
                        continue
                    if pid not in players:
                        players[pid] = {'source_player_id':pid,'full_name':name,
                           'first_team':team_id,'first_seen':date,'team_history':[],
                           'batting':{'games':0,'PA':0,'AB':0,'H':0,'HR':0,'BB':0,'SO':0},
                           'pitching':{'games':0,'IPOuts':0,'BF':0,'H':0,'HR':0,'BB':0,'SO':0,'ER':0}}
                    p=players[pid]
                    if p['full_name']!=name:
                        p.setdefault('other_names',[])
                        if name not in p['other_names']:p['other_names'].append(name)
                    p['team_history'].append((date,team_id))
                    stats=p['pitching' if is_pitcher else 'batting']
                    stats['games']+=1
                    for k in stats:
                        if k!='games':
                            try:stats[k]+=int(box.get(k,0) or 0)
                            except (TypeError,ValueError):pass
    out=[]
    for p in players.values():
        # Preserve traceable team movements; earliest team initializes the alternate-history 2024 season.
        history=sorted(set(p['team_history']))
        if history:
            p['first_seen'],p['first_team']=history[0]
        p['team_history']=[{'date':d,'team':t} for d,t in history]
        out.append(p)
    out.sort(key=lambda p:(p['first_team'],p['full_name'],p['source_player_id']))
    return {'dataset':'2024 CPBL game-appearance player index',
            'completeness':'appeared_in_regular_season_games_only; not full registered roster',
            'source':'https://github.com/rebas-tw/rebas.tw-open-data/releases/tag/v0.1.0-2024',
            'license':'ODC-By (attribution required)',
            'team_ids':sorted(teams_seen), 'games_examined':games_count,
            'player_count':len(out),'players':out}

def main(argv):
    if len(argv)!=3:
        raise SystemExit('Usage: prepare_rebas_2024.py CPBL-2024-OpenData.zip out.json')
    data=extract(load_games(argv[1]))
    if len(data['team_ids']) != 6 or data['games_examined']<300:
        raise SystemExit(f'Incomplete input, refusing output: games={data["games_examined"]}, teams={data["team_ids"]}')
    Path(argv[2]).parent.mkdir(parents=True,exist_ok=True)
    Path(argv[2]).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print('Collected',data['player_count'],'actual 2024 participants from',data['games_examined'],'games')

if __name__=='__main__':main(sys.argv)
