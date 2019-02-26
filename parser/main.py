import sys, json, os
from openpyxl import load_workbook, styles
import datetime

colors = {
	(0, 0, 0) : 'black',
	#(0, 128, 128) : teal
	(0, 128, 0) : 'green',
	(128, 128, 128) : 'gray',
	(0, 0, 255) : 'blue',
	#(0, 255, 255) : aqua
	(255, 0, 255) : 'fuchsia',
	(255, 255, 255) : 'white',
	(255, 255, 0) : 'yellow',
	(128, 0, 128) : 'purple',
	(192, 192, 192) : 'silver',
	#(0, 0, 128) : navy
	#(0, 255, 0) : lime
	#(128, 0, 0) : maroon
	(255, 165, 0) : 'orange',
	(255, 0, 0) : 'red',
	(128, 128, 0) : 'olive'
}

def get_colour_name(color):
	color = str(color)
	
	if len(color) != 6 and len(color) != 8:
		return
	
	color = bytearray.fromhex(color)
	
	if len(color) == 4:
		color = (color[1], color[2], color[3])
	elif len(color) != 3:
		return None
	
	min_colours = {}
	for key, name in colors.items():
		r_c, g_c, b_c = key
		rd = (r_c - color[0]) ** 2
		gd = (g_c - color[1]) ** 2
		bd = (b_c - color[2]) ** 2
		min_colours[(rd + gd + bd)] = name
	
	return min_colours[min(min_colours.keys())]

def convert_date_string(t):
	if isinstance(t, basestring):
		t = t.replace('-', ' ')
		t = t.replace('gen', 'gennaio')
		t = t.replace('feb', 'febbraio')
		t = t.replace('mar', 'marzo')
		t = t.replace('apr', 'aprile')
		t = t.replace('mag', 'maggio')
		t = t.replace('giu', 'giugno')
		t = t.replace('lug', 'luglio')
		t = t.replace('ago', 'agosto')
		t = t.replace('set', 'settembre')
		t = t.replace('ott', 'ottobre')
		t = t.replace('nov', 'novembre')
		t = t.replace('dic', 'dicembre')

		t = t.replace(' 16', ' 2016')
		t = t.replace(' 17', ' 2017')
		t = t.replace(' 18', ' 2018')
		t = t.replace(' 19', ' 2019')
	elif isinstance(t, datetime.datetime):
		t = t.strftime('%d/%m/%Y')
	else:
		t = 'N.D.'
	
	return t

cat = sys.argv[1]
type = sys.argv[2]

# https://bitbucket.org/openpyxl/openpyxl/issues/668/unable-to-handle-excel-file-with-maximum
read_only = True
if (cat == 'cab' and type == 'p') or (cat == 'node'):
	read_only = False

wb = load_workbook(filename=sys.argv[3], read_only=read_only)

ws = wb.worksheets[1]

outfile = cat + '-' + type + '.json'
outpath = os.path.join(os.path.dirname(sys.argv[3]), outfile)
file = open(outpath, 'w')

n = 0;
for row in ws.rows:
	n += 1
	
	cell = row[0]
	# Skip empty lines
	if (cell.value is None):
		continue
	
	elif cat == 'cab' and type == 'ap':
		if (n <= 2):
			continue;
		
		info = {
			'nodeClli': row[0].value or '',
			'nodeName': row[1].value or '',
			'region': row[2].value or '',
			'municipality': row[3].value or '',
			'onuClli': row[4].value or '',
			'onuId': row[5].value or '',
			'onuType': row[6].value or '',
			'speed': row[7].value or '',
			'status': row[8].value or '',
			'activationDate': row[9].value or '',
			'planningDate': convert_date_string(row[10].value or ''),
			'notes': row[11].value or ''
		}

	elif cat == 'node' and type == 'a':
		if (n <= 6):
			continue;
		
		info = {
			'nodeClli': row[2].value or '',
			'nodeName': row[3].value or '',
			'region': row[4].value or '',
			'district': row[5].value or '',
			'municipality': row[6].value or '',
			'feederClli': row[9].value or '',
			'feederName': row[10].value or '',
			'macroAreaName': row[11].value or '',
			'variationState': row[12].value or '',
			'vula1Gbit': row[13].value or '',
			'vula10Gbit': row[14].value or '',
			'notes': row[15].value or '',
			'activationDate': row[16].value or ''
		}
	
	elif cat == 'node' and type == 'p':
		if (n <= 6):
			continue;
		
		info = {
			'nodeClli': row[2].value or '',
			'nodeName': row[3].value or '',
			'region': row[4].value or '',
			'district': row[5].value or '',
			'municipality': row[6].value or '',
			'feederClli': row[9].value or '',
			'feederName': row[10].value or '',
			'macroAreaName': row[11].value or '',
			'variationState': row[13].value or '',
			'notes': row[14].value or '',
			'planningDate': convert_date_string(row[15].value or '')
		}
	
	
	# Extract cells foreground color
	color = ''
	if (cell.font and cell.font.color):
		if cell.font.color.type == 'indexed':
			color = styles.colors.COLOR_INDEX[cell.font.color.indexed]
		elif cell.font.color.type == 'rgb':
			color = cell.font.color.rgb
	
	color = get_colour_name(color)
	
	if color == 'red': # FFFF0000
		info['isNew'] = True
	elif color == 'blue': # FF0070C0, FF00B0F0
		info['isChanged'] = True
	elif color == 'green': # FF00B050, FF009900, 00008000
		info['isChanged'] = True
	else:
		info['isNew'] = False
		info['isChanged'] = False
	
	file.write(json.dumps(info))
	file.write('\n')

file.close()
print outpath
