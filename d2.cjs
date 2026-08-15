require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { EgressClient } = require('livekit-server-sdk');
const p = new PrismaClient();
(async () => {
  const rows = await p.session.findMany({
    where: { teacherId: 'eeb9c86a-e46d-4b55-b9ca-3b012e565c9f' },
    orderBy: { createdAt: 'desc' }, take: 3,
    select: { id:true, status:true, recordingEnabled:true, egressId:true, createdAt:true, endedAt:true,
              recordings: { select:{ storageKey:true, sizeBytes:true } } },
  });
  const eg = new EgressClient((process.env.LIVEKIT_URL||'').replace(/^ws/,'http'),
    process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
  const N = {0:'STARTING',1:'ACTIVE',2:'ENDING',3:'COMPLETE',4:'FAILED',5:'ABORTED'};
  for (const r of rows) {
    console.log('--- ' + r.id.slice(0,8) + ' ' + r.createdAt.toISOString().slice(11,19) + ' ' + r.status +
                ' rec=' + r.recordingEnabled + ' egress=' + r.egressId + ' rows=' + r.recordings.length);
    if (!r.egressId) { console.log('    NO EGRESS STARTED'); continue; }
    try {
      const [i] = await eg.listEgress({ egressId: r.egressId });
      const seg = i && i.segmentResults && i.segmentResults[0];
      const f = i && i.fileResults && i.fileResults[0];
      console.log('    status=' + (N[i&&i.status]||(i&&i.status)) +
        ' playlist=' + (seg&&seg.playlistName) + ' segs=' + (seg&&seg.segmentCount) + ' size=' + (seg&&seg.size) +
        ' file=' + (f&&f.filename) + (i&&i.error ? '\n    error=' + i.error : ''));
    } catch (e) { console.log('    listEgress failed: ' + e.message); }
  }
})().catch(e=>console.log('THREW: '+e.message)).finally(()=>p.$disconnect());
