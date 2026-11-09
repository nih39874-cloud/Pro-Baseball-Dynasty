"""Hand-transcribed historical CPBL FA announcements; preserve date and distinctions.

2024 values are published *end-of-season* service, not 2024 opening years.
Annual qualifying service may depend on one-team registration days unavailable here.
"""
import json
from pathlib import Path
out=Path(__file__).resolve().parents[1]/'data/fa_2023_2024_reference.json'
y2023='''林泓育 林智平 郭嚴文 余德龍 郭永維 陳俊秀 黃偉晟 朱育賢 高國慶 潘威倫 王鏡銘 江承峰 唐肇廷 胡金龍 陳子豪 鄭凱文 黃鈞聲 王勝偉 高國輝 葉竹軒 劉時豪 林智勝 王溢正'''.split()
recs=[]
rows9='''陳子豪 11.004 A
黃鈞聲 10.030 B
高國慶 19.002 B
潘威倫 16.038 B
王鏡銘 13.043 A
江承峰 10.091 B
胡金龍 10.067 A
唐肇廷 9.109 B
陳韻文 9.033 A
陳鏞基 4.000 A
林泓育 14.105 A
林智平 13.124 B
余德龍 12.083 B
黃偉晟 10.030 B
梁家榮 9.108 A
林承飛 9.011 A
朱育賢 9.000 A
郭嚴文 13.075 A
林智勝 8.000 A
王勝偉 6.034 A
郭永維 11.089 A
王溢正 9.107 A
賴鴻誠 4.000 A'''
repeat={'陳鏞基','林智勝','王勝偉','賴鴻誠'}
rows8='''謝榮豪 8.092 B
許基宏 8.051 A
詹子賢 8.039 A
林岱安 8.100 A
林哲瑄 8.113 A
高國麟 8.109 A
李宗賢 8.037 A
藍寅倫 8.078 A
王躍霖 8.069 A'''
for typ,rows in [('nine_or_repeat',rows9),('eight_conditional',rows8)]:
 for ln in rows.splitlines():
  name,value,grade=ln.split();recs.append(dict(name=name,service_seasons=float(value),qualification=typ,grade=grade,requalified_after_exercise=name in repeat,eligible_by_2023=name in y2023))
for name,value in [('陳家駒',7.120),('邱浩鈞',7.124)]:
 recs.append(dict(name=name,service_seasons=value,qualification='near_15_days',grade=None,requalified_after_exercise=False,eligible_by_2023=name in y2023))
out.write_text(json.dumps({'source_2024':'https://gobaseball.gogoal.com.tw/archives/13525','source_2023':'https://tsna.com/article/80231', 'date_2024':'2024-10-30','date_2023':'2023-11-13','notation':'x.yyy means x whole qualified seasons + yyy registered days, NOT mathematical decimal years', 'service_2024':recs,'qualified_2023':y2023},ensure_ascii=False,indent=2))
print('written',out,'year2023',len(y2023),'year2024',len(recs))
