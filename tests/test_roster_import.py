import sys
import unittest
sys.path.insert(0,'scripts')
from prepare_rebas_2024 import extract

class RosterExtractorTest(unittest.TestCase):
    def test_players_and_team_history(self):
        game={'date':'2024-04-01','seq':1,'homeTeam':'中信兄弟','awayTeam':'台鋼雄鷹',
              'homeBatterBox':[{'playerId':'a','playerName':'某球員','PA':4,'AB':4,'H':2}],
              'homePitcherBox':[{'playerId':'p','playerName':'某投手','IPOuts':18}],
              'awayBatterBox':[{'playerId':'b','playerName':'某打者','PA':4}],
              'awayPitcherBox':[]}
        o=extract([game,dict(game,seq=2)])
        self.assertEqual(o['player_count'],3)
        a=next(x for x in o['players'] if x['source_player_id']=='a')
        self.assertEqual(a['batting']['PA'],8)
        self.assertEqual(len(a['team_history']),1)
        self.assertEqual(a['first_team'],'brothers')

if __name__=='__main__':unittest.main()
