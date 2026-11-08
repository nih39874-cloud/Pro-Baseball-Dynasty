#!/usr/bin/env python3
"""Curated CPBL draft-pick facts (2025: 49, 2026: 50), with source links.

These are draft selections, not confirmations that a contract was signed.
"""
import json
from pathlib import Path

TEAM_25=['TSG','guardians','dragons','rakuten','unilions','brothers']
R25=[
 ['韋宏亮','張育豪','黃暐傑','鍾亦恩','曾偉喆','蔡琞傑'],
 ['朱盟','劉承佑','吳承皓','許賀捷','哀宥宇','徐磊'],
 ['邱立璿','石梓霖','林紘維','陳世展','王翾祐','焦子杰'],
 ['林建宏','江庭毅','何宗旂','李育朋','吳紹遠','呂昱廷'],
 ['顏采丞','王偉軒','崔琞允','王奕翔','黃天賜','王興楷'],
 ['張豈豪','王君佑','林軒宇','劉曜維','高偉強','錢可倫'],
 ['許承恩','陽杰恩','傅鈞致','李柏毓','吳柏賢','陳英睿'],
 [None,'黃騰威','林鴻祥','余新喆','陳定均','高秉洋'],
 [None,'高慶麟',None,None,None,None],
 [None,'鄭昭誠',None,None,None,None],
]
TEAM_26=['guardians','dragons','TSG','unilions','brothers','rakuten']
R26=[
 [('陳柏凱','IF'),('廖永詮','OF'),('邱文佑','IF'),('黃靖哲','IF'),('許書誠','IF'),('陳趙羿勳','P')],
 [('余冠諭','P'),('黃宥儒','P'),('永田颯太郎','IF'),('李星漢','P'),('巫宏威','P'),('鄭鈞澤','IF')],
 [('陳霆豪','P'),('李崧睿','P'),('宋書桓','P'),('王靖崴','P'),('賴承鍇','P'),('曾乙倫','P')],
 [('帕蘇拉·塔基斯利尼安','OF'),('傅振閎','P'),('顏承恩','P'),('曾睿豪','P'),('黃玠瀚','P'),('尤丞翊','OF')],
 [('秦琮恩','P'),('許峰穎','IF'),('黃彥博','OF'),('王乃文','OF'),('林鈞瑋','OF'),('莊偉晟','P')],
 [('全永樂','IF'),('李承峻','IF'),('邱承奕','P'),('黃靖智','C'),('洪晨勛','P'),('吳柏霆','P')],
 [('李聖韓','P'),('黃子睿','P'),None,('郭靖源','P'),('石主恩','P'),('白井雄登','C')],
 [('劉建利','P'),('施博翔','P'),None,None,('机崇瑋','OF'),('莊承翰','P')],
 [('吉路·少瑪','IF'),('洪嘉恩','P'),None,None,('吳家畯','IF'),None],
 [None,None,None,None,('大瀧幸治','P'),None],
 [None,None,None,None,('王羽飛','OF'),None],
]
def build():
    players=[]
    for rnd,row in enumerate(R25,1):
        for team,name in zip(TEAM_25,row):
            if name:players.append({'draft_year':2025,'draft_round':rnd,'team_id':team,'full_name':name,'position':None})
    for rnd,row in enumerate(R26,1):
        for team,entry in zip(TEAM_26,row):
            if entry:players.append({'draft_year':2026,'draft_round':rnd,'team_id':team,'full_name':entry[0],'position':entry[1]})
    count25=sum(p['draft_year']==2025 for p in players)
    count26=sum(p['draft_year']==2026 for p in players)
    assert (count25,count26)==(49,50),(count25,count26)
    assert len({(p['draft_year'],p['team_id'],p['draft_round']) for p in players})==99
    return {'data_type':'public CPBL draft selections; signed status unverified',
            'sources':{'2025':'https://www.taisounds.com/news/content/101/198946',
                       '2026':'https://www.sportsv.net/articles/127291',
                       '2026_cpbl':'https://cpbl.com.tw/xmdoc/cont?sid=0Q182363941928722668'},
            'count_2025':count25,'count_2026':count26,'players':players}
if __name__=='__main__':
    p=Path(__file__).resolve().parents[1]/'data'/'draft_picks_2025_2026.json'
    p.parent.mkdir(exist_ok=True)
    data=build()
    p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Created',p,'with',len(data['players']),'picks')