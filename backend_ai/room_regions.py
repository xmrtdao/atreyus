"""Reviewable room boundaries traced from the four supplied vector sheets.

These are layout metadata, never device coordinates/counts. Rectangles follow
drawn walls; the open Living/Kitchen boundary follows the labelled zones. The UI
shows them and permits replacement by a user-drawn room. Other PDFs use text labels.
"""
REGIONS = [
    [
        ('Equipment alcove (unlabelled)',(1290,210,1347,270)),
        ('Laundry',(1090,210,1195,279)),
        ('Closet 1',(1195,375,1347,420)),
        ('Closet 2',(958,535,1010,598)),
        ('Bath',(1195,210,1347,375)),
        ('Bedroom / Studio',(1195,420,1347,598)),
        ('Kitchen / Dining',(958,210,1195,415)),
        ('Living',(958,415,1195,598)),
    ],
    [
        ('Equipment alcove (unlabelled)',(1025,190,1075,240)),
        ('Closet 1',(390,190,570,242)),
        ('Closet 2',(1075,190,1210,242)),
        ('Laundry',(918,190,1025,275)),
        ('Bath',(810,330,1025,432)),
        ('Bedroom 1',(390,242,570,432)),
        ('Bedroom 2',(1025,242,1210,432)),
        ('Kitchen',(570,190,780,275)),
        ('Dining',(780,190,918,275)),
        ('Hallway',(810,275,1025,330)),
        ('Living',(570,275,810,432)),
    ],
    [
        ('Equipment alcove (unlabelled)',(1305,407,1358,455)),
        ('Closet 1',(1065,105,1110,225)),
        ('Closet 2',(1110,105,1157,225)),
        ('Closet 3',(1140,400,1200,455)),
        ('Closet 4',(877,600,930,660)),
        ('Laundry',(1140,295,1200,400)),
        ('Bath 2',(877,295,1065,392)),
        ('Bath 1',(1200,295,1358,455)),
        ('Bedroom 2',(877,105,1065,295)),
        ('Bedroom 1',(1157,105,1358,295)),
        ('Hall',(1065,225,1200,455)),
        ('Kitchen / Dining',(877,392,1145,660)),
        ('Living',(1145,455,1358,660)),
    ],
    [
        ('Equipment alcove (unlabelled)',(1358,375,1401,426)),
        ('Closet 1',(1315,445,1358,553)),
        ('Closet 2',(1665,310,1800,360)),
        ('Laundry',(1500,350,1600,420)),
        ('Walk-in closet',(1500,420,1600,553)),
        ('Bath 2',(1500,110,1600,290)),
        ('Bath 1',(1358,375,1500,553)),
        ('Hallway',(1500,290,1665,350)),
        ('Optional Bedroom 3',(1150,375,1358,553)),
        ('Bedroom 1',(1600,350,1797,553)),
        ('Bedroom 2',(1600,110,1797,310)),
        ('Kitchen',(1310,110,1500,375)),
        ('Living',(1058,110,1310,375)),
    ]
]

# Open-plan zones are polygons: a kitchen counter can continue down the side of a living zone.
POLYGONS={
    (0,'Kitchen / Dining'):[(958,210),(1195,210),(1195,415),(1020,415),(1020,500),(958,500)],
    (0,'Living'):[(1020,415),(1195,415),(1195,598),(958,598),(958,500),(1020,500)],
    (1,'Kitchen'):[(570,190),(918,190),(918,220),(780,220),(780,275),(570,275)],
    (1,'Dining'):[(780,220),(918,220),(918,275),(900,275),(900,310),(810,310),(810,275),(780,275)],
    (1,'Hallway'):[(918,275),(1025,275),(1025,330),(810,330),(810,310),(900,310),(900,275)],
}

def contains(room,x,y):
    pts=room.get('polygon')
    if not pts:return room.get('x0',2)<=x<=room.get('x1',-1) and room.get('y0',2)<=y<=room.get('y1',-1)
    inside=False
    for a,b in zip(pts,pts[1:]+pts[:1]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:inside=not inside
    return inside

def rooms_for(meta):
    ref=meta.get('referenceIndex')
    if ref is None:return None
    x,y,x1,y1=meta['clip']; w=x1-x;h=y1-y
    rooms=[]
    for i,(name,(a,b,c,d)) in enumerate(REGIONS[ref]):
        rooms.append({'id':f'region-{ref}-{i}','name':name,'x0':(a-x)/w,'y0':(b-y)/h,
                      'x1':(c-x)/w,'y1':(d-y)/h,'source':'sheet-wall-review'})
        if (ref,name) in POLYGONS:
            rooms[-1]['polygon']=[[(px-x)/w,(py-y)/h] for px,py in POLYGONS[ref,name]]
    return rooms
