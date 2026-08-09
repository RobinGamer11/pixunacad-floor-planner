# PixunaCAD Floor Planner

Ich möchte ein Architektur CAD-Programm zum zeichnen von Grundrissen erstellen. Man soll sich registrieren können, um projekte speichern zu können. Ich habe bereits einen code an dem du dich bitte orientieren sollst. das design ist jedoch noch nicht perfekt. Das Programm soll PixunaCAD heißen. Das vorhandene Linienwerkzeug ist jedoch so in dieser Form grandios. Die FUnktionen sollten also 1 zu 1 identisch bleiben. Bitte erstelle mir anhand des Codes ein Programm. Der Code ist folgender: 


/* ###################################################################### */

/* ##########################  80 / TOOL: LINIE ########################## */

/* ###################################################################### */

class LineTool{

  constructor(app){

    this.app=app;

    this.id=ToolIds.LINE;




    this.state="idle";

    this.currentPoint=null;

    this.snap=null;

    this.activeTargetSegmentId=null;

    this.startReferenceSegmentId=null;




    this.hubLocked=false;

    this.hubLengthM=null;

    this.hubAngleDeg=null;




    this.guideAnchors=[];

    this.parallelGuideSegments=[];




    this.spaceShiftLocked=false;

    this.spaceShiftLockedAngleDeg=null;




    this.app.hub.bindCommit((vals)=>this._applyHubValues(vals));

  }




  activate(){

    this.resetGuides();

    this.app.hub.bindCommit((vals)=>this._applyHubValues(vals));

    this.state="idle";

    this.currentPoint=null;

    this.snap=null;

    this.activeTargetSegmentId=null;

    this.startReferenceSegmentId=null;

    this.hubLocked=false;

    this.hubLengthM=null;

    this.hubAngleDeg=null;

    this.spaceShiftLocked=false;

    this.spaceShiftLockedAngleDeg=null;

    this.app.renderer.setHoverSegmentId(null);

    this.app.hub.hide();

    this.app.pointEditMenu.hide();

    this.app.renderer.overlay = {

      draw:(ctx,cam)=>this._drawOverlay(ctx,cam)

    };

  }




  cancel(){

    this.resetGuides();

    this.state="idle";

    this.currentPoint=null;

    this.snap=null;

    this.activeTargetSegmentId=null;

    this.startReferenceSegmentId=null;

    this.hubLocked=false;

    this.hubLengthM=null;

    this.hubAngleDeg=null;

    this.spaceShiftLocked=false;

    this.spaceShiftLockedAngleDeg=null;

    this.app.renderer.setHoverSegmentId(null);

    this.app.hub.hide();

  }




  finish(){

    this.cancel();

  }




  resetGuides(){

    this.guideAnchors=[];

    this.parallelGuideSegments=[];

  }




  isDrawing(){

    return this.state==="drawing";

  }




  _makeAnchorKey(segmentId, pointIndex){

    return `${segmentId}__${pointIndex}`;

  }




  _makeParallelKey(segmentId){

    return `${segmentId}`;

  }




  _toggleGuideAnchorFromSnap(snap){

    if(!snap || snap.type!==SnapType.POINT || !snap.segment) return;




    const key=this._makeAnchorKey(snap.segment.id, snap.pointIndex);

    const idx=this.guideAnchors.findIndex(a=>a.key===key);




    if(idx>=0){

      this.guideAnchors.splice(idx,1);

      return;

    }




    this.guideAnchors.push({

      key,

      segmentId:snap.segment.id,

      pointIndex:snap.pointIndex,

      point:v(snap.world.x,snap.world.y)

    });

  }




  _toggleParallelGuideFromSnap(snap){

    if(!snap || snap.type!==SnapType.LINE || !snap.segment || !this.currentPoint) return;




    const key=this._makeParallelKey(snap.segment.id);

    const idx=this.parallelGuideSegments.findIndex(g=>g.key===key);




    if(idx>=0){

      this.parallelGuideSegments.splice(idx,1);

      return;

    }




    this.parallelGuideSegments.push({

      key,

      segmentId:snap.segment.id

    });

  }




  _getReferenceSegment(){

    if(this.snap && this.snap.segment) return this.snap.segment;




    if(this.startReferenceSegmentId){

      const s=this.app.scene.getSegmentById(this.startReferenceSegmentId);

      if(s) return s;

    }




    if(this.activeTargetSegmentId){

      return this.app.scene.getSegmentById(this.activeTargetSegmentId);

    }




    return null;

  }




  _buildGuideDefinitions(){

    const defs=[];

    const refSeg=this._getReferenceSegment();

    const refDir=refSeg ? norm(sub(refSeg.b, refSeg.a)) : null;

    const refPerp=refDir ? v(-refDir.y, refDir.x) : null;




    for(const anchor of this.guideAnchors){

      const p=anchor.point;




      defs.push({point:p, dir:v(1,0)});

      defs.push({point:p, dir:v(0,1)});




      if(refDir){

        defs.push({point:p, dir:refDir});

      }

      if(refPerp){

        defs.push({point:p, dir:refPerp});

      }

    }




    if(this.currentPoint){

      for(const item of this.parallelGuideSegments){

        const seg=this.app.scene.getSegmentById(item.segmentId);

        if(!seg) continue;




        const dir=norm(sub(seg.b, seg.a));

        defs.push({

          point:v(this.currentPoint.x, this.currentPoint.y),

          dir,

          parallelSourceSegmentId:seg.id

        });

      }

    }




    return defs;

  }




  _buildGuideIntersections(guideDefs){

    const points=[];




    for(let i=0;i<guideDefs.length;i++){

      for(let j=i+1;j<guideDefs.length;j++){

        const g1=guideDefs[i];

        const g2=guideDefs[j];




        const ip=lineLineIntersectionInfinite(g1.point, g1.dir, g2.point, g2.dir);

        if(!ip) continue;




        let duplicate=false;

        for(const p of points){

          if(dist(p, ip) <= 1e-6){

            duplicate=true;

            break;

          }

        }

        if(!duplicate) points.push(ip);

      }

    }




    return points;

  }




  _getGuideRenderSegment(point, dir){

    const cam=this.app.camera;

    const span=(Math.hypot(this.app.renderer.vw, this.app.renderer.vh) / cam.scale) * 1.5;

    const d=norm(dir);

    return {

      a:sub(point, mul(d, span)),

      b:add(point, mul(d, span))

    };

  }




  _findGuideIntersectionSnap(mouseS){

    const defs=this._buildGuideDefinitions();

    const intersections=this._buildGuideIntersections(defs);




    let best=null;

    let bestPx=Infinity;




    for(const p of intersections){

      const px=this.app.topology._worldToMousePx(p, mouseS);

      if(px>Defaults.snapPx) continue;




      if(px<bestPx){

        bestPx=px;

        best={

          type:SnapType.GUIDE_POINT,

          world:v(p.x,p.y),

          segment:null,

          pointIndex:null,

          t:null,

          px

        };

      }

    }




    return best;

  }




  _findGuideSnap(mouseS, mouseW){

    let best=this._findGuideIntersectionSnap(mouseS);

    let bestScore=best ? best.px - 50 : Infinity; /* Kreuzungen bevorzugen */




    const defs=this._buildGuideDefinitions();




    for(const def of defs){

      const proj=projectPointToInfiniteLine(mouseW, def.point, def.dir);

      const sp=this.app.camera.worldToScreen(proj.q.x, proj.q.y);

      const px=Math.hypot(sp.x-mouseS.x, sp.y-mouseS.y);

      if(px>Defaults.snapPx) continue;




      const seg=this._getGuideRenderSegment(def.point, def.dir);

      const score=500+px;




      if(score<bestScore){

        bestScore=score;

        best={

          type:SnapType.GUIDE,

          world:v(proj.q.x,proj.q.y),

          segment:null,

          pointIndex:null,

          t:null,

          px,

          lineA:seg.a,

          lineB:seg.b,

          guidePoint:def.point,

          guideDir:def.dir

        };

      }

    }




    return best;

  }




  _findLineToolSnap(input){

    const mouseS=v(input.mouse.sx,input.mouse.sy);

    const mouseW=v(input.mouse.wx,input.mouse.wy);




    const hoveredLineSnap=this.app.topology.findNearestLineSnap(mouseS, mouseW);




    if(hoveredLineSnap && hoveredLineSnap.segment){

      this.activeTargetSegmentId=hoveredLineSnap.segment.id;

    }




    const activeSegment=this.activeTargetSegmentId

      ? this.app.scene.getSegmentById(this.activeTargetSegmentId)

      : null;




    const preferredPointSnap=activeSegment

      ? this.app.topology.findPointSnapOnSegment(mouseS, activeSegment)

      : null;




    if(preferredPointSnap) return preferredPointSnap;




    const guideSnap=this._findGuideSnap(mouseS, mouseW);

    if(guideSnap && guideSnap.type===SnapType.GUIDE_POINT) return guideSnap;




    const bestSceneSnap=this.app.topology.findBestSnap(mouseS, mouseW);

    if(bestSceneSnap && bestSceneSnap.type===SnapType.POINT) return bestSceneSnap;




    if(guideSnap) return guideSnap;

    if(hoveredLineSnap) return hoveredLineSnap;

    return bestSceneSnap;

  }




  _angleFromSpaceRules(basePoint, rawPoint){

    const currentAngle=angleDeg(basePoint, rawPoint);

    const refSeg=this._getReferenceSegment();




    if(refSeg){

      const base=angleDeg(refSeg.a, refSeg.b);

      const options=[

        ((base)%360+360)%360,

        ((base+180)%360+360)%360,

        ((base+90)%360+360)%360,

        ((base+270)%360+360)%360

      ];

      return nearestAngleToReference(options, currentAngle);

    }




    const orthoPoint=orthoSnapFromA(basePoint, rawPoint);

    return angleDeg(basePoint, orthoPoint);

  }




  _syncSpaceShiftLock(input){

    const comboNow = this.state==="drawing" && !!this.currentPoint && input.keys.space && input.keys.shift;




    if(comboNow && !this.spaceShiftLocked){

      const raw=this._rawPreviewWorld(input);

      this.spaceShiftLockedAngleDeg=this._angleFromSpaceRules(this.currentPoint, raw);

      this.spaceShiftLocked=true;

      return;

    }




    if(!comboNow){

      this.spaceShiftLocked=false;

      this.spaceShiftLockedAngleDeg=null;

    }

  }




  _applyRelativeConstraint(basePoint, rawPoint, input){

    if(input.keys.space && input.keys.shift){

      const lockedAngle = (this.spaceShiftLockedAngleDeg!=null)

        ? this.spaceShiftLockedAngleDeg

        : this._angleFromSpaceRules(basePoint, rawPoint);




      const dir=pointFromLengthAngle(v(0,0),1,lockedAngle);

      const rel=sub(rawPoint, basePoint);

      const projectedLen=dot(rel, dir);

      return pointFromLengthAngle(basePoint, projectedLen, lockedAngle);

    }




    const currentAngle=angleDeg(basePoint, rawPoint);




    if(input.keys.space){

      const refSeg=this._getReferenceSegment();




      if(refSeg){

        const base=angleDeg(refSeg.a, refSeg.b);

        const options=[

          ((base)%360+360)%360,

          ((base+180)%360+360)%360,

          ((base+90)%360+360)%360,

          ((base+270)%360+360)%360

        ];




        const snapped=nearestAngleToReference(options, currentAngle);

        const dir=pointFromLengthAngle(v(0,0),1,snapped);

        const rel=sub(rawPoint, basePoint);

        const projectedLen=dot(rel, dir);

        return pointFromLengthAngle(basePoint, projectedLen, snapped);

      }




      return orthoSnapFromA(basePoint, rawPoint);

    }




    if(input.keys.shift){

      return orthoSnapFromA(basePoint, rawPoint);

    }




    return rawPoint;

  }




  _rawPreviewWorld(input){

    return this.snap && this.snap.world

      ? v(this.snap.world.x,this.snap.world.y)

      : v(input.mouse.wx,input.mouse.wy);

  }




  _previewWorld(input){

    if(this.state!=="drawing" || !this.currentPoint){

      return this._rawPreviewWorld(input);

    }




    if(this.hubLocked && this.hubLengthM!=null && this.hubAngleDeg!=null){

      return pointFromLengthAngle(this.currentPoint, this.hubLengthM, this.hubAngleDeg);

    }




    let p=this._rawPreviewWorld(input);

    p=this._applyRelativeConstraint(this.currentPoint, p, input);

    return p;

  }




  _previewMetrics(input){

    if(this.state!=="drawing" || !this.currentPoint){

      return {lengthM:0, angleDeg:0};

    }




    const b=this._previewWorld(input);

    return {

      lengthM:dist(this.currentPoint, b),

      angleDeg:angleDeg(this.currentPoint, b)

    };

  }




  _commitPoint(input){

    if(this.state==="drawing" && this.currentPoint){

      if(this.hubLocked && this.hubLengthM!=null && this.hubAngleDeg!=null){

        return pointFromLengthAngle(this.currentPoint, this.hubLengthM, this.hubAngleDeg);

      }




      let freePoint=this._rawPreviewWorld(input);

      const constrained = input.keys.space || input.keys.shift;

      freePoint=this._applyRelativeConstraint(this.currentPoint, freePoint, input);




      if(constrained){

        return v(freePoint.x, freePoint.y);

      }




      return this.app.topology.resolveSnapPoint(this.snap, freePoint);

    }




    const startPoint=this._rawPreviewWorld(input);

    return this.app.topology.resolveSnapPoint(this.snap, startPoint);

  }




  _refreshHoverSegment(){

    if(this.snap && this.snap.segment){

      this.app.renderer.setHoverSegmentId(this.snap.segment.id);

    }else{

      this.app.renderer.setHoverSegmentId(null);

    }

  }




  _openHubWithCurrentPreview(){

    if(this.state!=="drawing" || !this.currentPoint) return;




    const metrics=this._previewMetrics(this.app.input);

    this.hubLocked=true;

    this.hubLengthM=metrics.lengthM;

    this.hubAngleDeg=metrics.angleDeg;




    this.app.hub.showAt(this.app.input.mouse.sx, this.app.input.mouse.sy);

    this.app.hub.updateDisplay(this.hubLengthM, this.hubAngleDeg);

    this.app.hub.setValues(this.hubLengthM, this.hubAngleDeg);

    this.app.hub.enterEditMode();

  }




  _applyHubValues(vals){

    if(this.state!=="drawing" || !this.currentPoint) return;




    const nextLen=(vals.lengthM!=null) ? Math.max(0, vals.lengthM) : this.hubLengthM;

    const nextAng=(vals.angleDeg!=null) ? vals.angleDeg : this.hubAngleDeg;




    this.hubLengthM=nextLen;

    this.hubAngleDeg=((nextAng % 360) + 360) % 360;

    this.hubLocked=true;

    this.app.hub.setValues(this.hubLengthM, this.hubAngleDeg);

    this.app.hub.updateDisplay(this.hubLengthM, this.hubAngleDeg);

  }




  update(input){

    this.snap=this._findLineToolSnap(input);

    this._refreshHoverSegment();

    this._syncSpaceShiftLock(input);




    if(input.rightClicked){

      if(this.snap && this.snap.type===SnapType.POINT){

        this._toggleGuideAnchorFromSnap(this.snap);

        return;

      }

      if(this.snap && this.snap.type===SnapType.LINE){

        this._toggleParallelGuideFromSnap(this.snap);

        return;

      }

    }




    if(this.state==="drawing"){

      const metrics=this._previewMetrics(input);

      this.app.hub.showAt(input.mouse.sx, input.mouse.sy);

      this.app.hub.updateDisplay(metrics.lengthM, metrics.angleDeg);

    }else{

      this.app.hub.hide();

    }




    if(input.doubleClicked){

      this.finish();

      return;

    }




    if(input.clicked){

      this._onClick(input);

    }

  }




  _onClick(input){

    const point=this._commitPoint(input);




    if(this.state==="idle"){

      this.currentPoint=v(point.x,point.y);

      this.state="drawing";

      this.hubLocked=false;

      this.hubLengthM=null;

      this.hubAngleDeg=null;

      this.startReferenceSegmentId=this.snap?.segment?.id || null;

      return;

    }




    if(dist(this.currentPoint, point) < Defaults.minSegLenM){

      return;

    }




    this.app.scene.createSegment(this.currentPoint, point, this.app.getCurrentLineStyle());

    this.app.clearSelection();

    this.currentPoint=v(point.x,point.y);

    this.hubLocked=false;

    this.hubLengthM=null;

    this.hubAngleDeg=null;

    this.startReferenceSegmentId=this.snap?.segment?.id || null;

  }




  onTabRequest(){

    if(this.state!=="drawing") return false;

    this._openHubWithCurrentPreview();

    return true;

  }




  _drawGuideDefinitions(ctx,cam){

    const defs=this._buildGuideDefinitions();

    if(defs.length===0) return;




    ctx.save();

    ctx.strokeStyle="rgba(77,163,255,0.42)";

    ctx.lineWidth=1;

    ctx.setLineDash([5,5]);




    for(const def of defs){

      const seg=this._getGuideRenderSegment(def.point, def.dir);

      const a=cam.worldToScreen(seg.a.x, seg.a.y);

      const b=cam.worldToScreen(seg.b.x, seg.b.y);




      ctx.beginPath();

      ctx.moveTo(a.x,a.y);

      ctx.lineTo(b.x,b.y);

      ctx.stroke();

    }




    ctx.setLineDash([]);

    ctx.restore();




    ctx.save();

    ctx.fillStyle="rgba(77,163,255,0.95)";

    ctx.strokeStyle="rgba(255,255,255,0.95)";

    ctx.lineWidth=1.5;




    for(const anchor of this.guideAnchors){

      const s=cam.worldToScreen(anchor.point.x, anchor.point.y);

      ctx.beginPath();

      ctx.arc(s.x,s.y,4.5,0,Math.PI*2);

      ctx.fill();

      ctx.stroke();

    }




    const intersections=this._buildGuideIntersections(defs);

    for(const p of intersections){

      const s=cam.worldToScreen(p.x,p.y);

      ctx.beginPath();

      ctx.arc(s.x,s.y,4,0,Math.PI*2);

      ctx.fill();

      ctx.stroke();

    }




    ctx.restore();

  }




  _drawOverlay(ctx,cam){

    this._drawGuideDefinitions(ctx,cam);




    const css=getComputedStyle(document.documentElement);




    if(this.snap){

      if((this.snap.type===SnapType.LINE || this.snap.type===SnapType.GUIDE) && this.snap.lineA && this.snap.lineB){

        const a=cam.worldToScreen(this.snap.lineA.x,this.snap.lineA.y);

        const b=cam.worldToScreen(this.snap.lineB.x,this.snap.lineB.y);




        ctx.save();

        ctx.strokeStyle=css.getPropertyValue("--snapLine") || "rgba(77,163,255,0.42)";

        ctx.lineWidth=2;

        if(this.snap.type===SnapType.GUIDE) ctx.setLineDash([4,4]);

        ctx.beginPath();

        ctx.moveTo(a.x,a.y);

        ctx.lineTo(b.x,b.y);

        ctx.stroke();

        ctx.setLineDash([]);

        ctx.restore();

      }




      const s=cam.worldToScreen(this.snap.world.x,this.snap.world.y);

      ctx.save();

      ctx.fillStyle=css.getPropertyValue("--snapPoint") || "rgba(77,163,255,0.95)";

      ctx.beginPath();

      ctx.arc(s.x,s.y,4.5,0,Math.PI*2);

      ctx.fill();




      ctx.strokeStyle="rgba(77,163,255,0.45)";

      ctx.lineWidth=1.5;

      ctx.beginPath();

      ctx.arc(s.x,s.y,10,0,Math.PI*2);

      ctx.stroke();

      ctx.restore();

    }




    if(this.state!=="drawing" || !this.currentPoint) return;




    const a=this.currentPoint;

    const b=this._previewWorld(this.app.input);

    const sa=cam.worldToScreen(a.x,a.y);

    const sb=cam.worldToScreen(b.x,b.y);

    const style=this.app.getCurrentLineStyle();




    ctx.save();

    ctx.strokeStyle=style.color;

    ctx.lineWidth=Math.max(0.5, style.thicknessM * cam.scale);

    ctx.beginPath();

    ctx.moveTo(sa.x,sa.y);

    ctx.lineTo(sb.x,sb.y);

    ctx.stroke();




    ctx.fillStyle="rgba(77,163,255,0.85)";

    ctx.beginPath();

    ctx.arc(sa.x,sa.y,4,0,Math.PI*2);

    ctx.fill();

    ctx.restore();

  }

}




/* ###################################################################### */

/* ##########################  90 / UI-HELFER ############################ */

/* ###################################################################### */

function setActiveButton(btnMap,id){

  for(const [k,btn] of btnMap.entries()){

    btn.classList.toggle("active", k===id);

  }

}




/* ###################################################################### */

/* ##########################  100 / APP ################################# */

/* ###################################################################### */

class App{

  constructor(){

    this.canvas=document.getElementById("canvas");

    this.ctx=this.canvas.getContext("2d");

    this.errEl=document.getElementById("err");

    this.toolButtonsEl=document.getElementById("toolButtons");




    this.hub=new LineHub(

      document.getElementById("lineHub"),

      document.getElementById("hubLenInput"),

      document.getElementById("hubAngInput")

    );




    this.pointEditMenu=new PointEditMenu(

      document.getElementById("pointEditMenu"),

      {

        [PointEditAction.MOVE]: document.getElementById("pointModeMove"),

        [PointEditAction.TRANSLATE]: document.getElementById("pointModeTranslate"),

        [PointEditAction.ROTATE]: document.getElementById("pointModeRotate")

      }

    );




    this.lineSettingsPanel=document.getElementById("lineSettingsPanel");

    this.lineColorInput=document.getElementById("lineColorInput");

    this.lineColorPreview=document.getElementById("lineColorPreview");

    this.lineThicknessInput=document.getElementById("lineThicknessInput");




    this.defaultLineColor=Defaults.lineColor;

    this.defaultLineThicknessM=Defaults.lineThicknessM;




    this.camera=new Camera();

    this.scene=new Scene();

    this.input=new Input(this.canvas);

    this.topology=new TopologyEngine(this.scene,this.camera);

    this.renderer=new Renderer(this.ctx,this.camera,this.scene);




    this.selectTool=new SelectTool(this);

    this.lineTool=new LineTool(this);

    this.activeTool=this.selectTool;




    this.selection=null;

    this._btnMap=new Map();




    this.pointEditMenu.bindActivate((action)=>{

      this.selectTool.beginPointEdit(action);

    });




    this._setupUI();

    this._setupShortcuts();

    this._setupSettingsPanel();




    this._resize();

    this.camera.center(this.canvas.getBoundingClientRect());

    window.addEventListener("resize",()=>this._resize());




    requestAnimationFrame(()=>this._tick());

  }




  setSelection(selection){

    this.selection=selection;

    this.renderer.setSelection(selection);

    this._syncSettingsFromContext();

    this._updateLineSettingsVisibility();

  }




  clearSelection(){

    this.setSelection(null);

  }




  getSelectedSegment(){

    if(!this.selection || !this.selection.segmentId) return null;

    return this.scene.getSegmentById(this.selection.segmentId);

  }




  getCurrentLineStyle(){

    const selected=this.getSelectedSegment();

    if(selected){

      return {

        color:selected.color || this.defaultLineColor,

        thicknessM:selected.thicknessM || this.defaultLineThicknessM

      };

    }




    return {

      color:this.defaultLineColor,

      thicknessM:this.defaultLineThicknessM

    };

  }




  showLineSettingsPanel(shouldShow){

    this.lineSettingsPanel.classList.toggle("hidden", !shouldShow);

  }




  _updateLineSettingsVisibility(){

    const shouldShow = (this.activeTool===this.lineTool) || !!(this.selection && this.selection.segmentId);

    this.showLineSettingsPanel(shouldShow);

  }




  _setupUI(){

    const tools=[

      {id:ToolIds.SELECT, label:"Auswahl", key:"V"},

      {id:ToolIds.LINE,   label:"Linie",   key:"L"}

    ];




    for(const t of tools){

      const btn=document.createElement("button");

      btn.className="tool-btn";

      btn.innerHTML=`<span>${t.label}</span><span class="tool-key">${t.key}</span>`;

      btn.addEventListener("click",()=>this.setTool(t.id));

      this.toolButtonsEl.appendChild(btn);

      this._btnMap.set(t.id,btn);

    }




    this.setTool(ToolIds.SELECT);

  }




  _setupSettingsPanel(){

    this.lineColorInput.addEventListener("input",()=>{

      this._applyLineColor(this.lineColorInput.value);

    });




    this.lineThicknessInput.addEventListener("input",()=>{

      this._applyLineThicknessFromInput();

    });




    this.lineThicknessInput.addEventListener("blur",()=>{

      this._syncSettingsFromContext();

    });




    this._syncSettingsFromContext();

    this._updateLineSettingsVisibility();

  }




  _applyLineColor(color){

    const selected=this.getSelectedSegment();

    if(selected){

      selected.color=color;

    }else{

      this.defaultLineColor=color;

    }

    this._syncSettingsFromContext();

  }




  _applyLineThicknessFromInput(){

    let value=parseFloat((this.lineThicknessInput.value||"").replace(",", "."));

    if(!Number.isFinite(value) || value<=0) return;




    value=clamp(value, 0.001, 1);




    const selected=this.getSelectedSegment();

    if(selected){

      selected.thicknessM=value;

    }else{

      this.defaultLineThicknessM=value;

    }

  }




  _syncSettingsFromContext(){

    const style=this.getCurrentLineStyle();

    this.lineColorInput.value=this._toHexColor(style.color || Defaults.lineColor);

    this.lineColorPreview.style.background=this.lineColorInput.value;

    this.lineThicknessInput.value=String((style.thicknessM || Defaults.lineThicknessM).toFixed(3).replace(/0+$/,"").replace(/\.$/,""));

  }




  _toHexColor(color){

    const ctx=document.createElement("canvas").getContext("2d");

    ctx.fillStyle=color;

    const computed=ctx.fillStyle;




    if(computed.startsWith("#")) return computed;




    const m=computed.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);

    if(!m) return "#111111";




    const r=Number(m[1]).toString(16).padStart(2,"0");

    const g=Number(m[2]).toString(16).padStart(2,"0");

    const b=Number(m[3]).toString(16).padStart(2,"0");

    return `#${r}${g}${b}`;

  }




  _setupShortcuts(){

    window.addEventListener("keydown",(e)=>{

      const tag=(document.activeElement?.tagName||"").toLowerCase();

      const isHubInput =

        document.activeElement===this.hub.lenInputEl ||

        document.activeElement===this.hub.angInputEl;




      if((tag==="input" || tag==="textarea" || tag==="select") && !isHubInput) return;




      if(this.activeTool===this.selectTool){

        if(e.key==="Tab" && this.selectTool.hasPointMenu()){

          e.preventDefault();

          this.selectTool.cyclePointMenu();

          return;

        }




        if(e.key==="Enter" && this.selectTool.hasPointMenu()){

          e.preventDefault();

          this.selectTool.activatePointMenu();

          return;

        }

      }




      if(e.key==="Tab"){

        if(this.activeTool===this.lineTool){

          const handled=this.lineTool.onTabRequest();

          if(handled){

            e.preventDefault();

            return;

          }

        }

      }




      if(e.key==="v" || e.key==="V"){

        this.setTool(ToolIds.SELECT);

      }




      if(e.key==="l" || e.key==="L"){

        this.setTool(ToolIds.LINE);

      }




      if(e.key==="Escape"){

        if(this.activeTool===this.lineTool){

          this.lineTool.cancel();

          this.clearSelection();

          this.setTool(ToolIds.SELECT);

          return;

        }




        if(this.activeTool===this.selectTool){

          this.selectTool.cancel();

          this.clearSelection();

          this.pointEditMenu.hide();

          return;

        }




        this.activeTool.cancel();

        this.clearSelection();

      }




      if(e.key==="Delete" || e.key==="Backspace"){

        if(this.selection && this.selection.segmentId){

          const seg=this.scene.getSegmentById(this.selection.segmentId);

          if(seg){

            this.scene.removeSegment(seg);

            this.clearSelection();

            this.pointEditMenu.hide();

          }

        }

      }

    });

  }




  setTool(id){

    if(this.activeTool && this.activeTool.cancel){

      this.activeTool.cancel();

    }




    setActiveButton(this._btnMap,id);




    if(id===ToolIds.SELECT){

      this.activeTool=this.selectTool;

      this.selectTool.activate();

      this._syncSettingsFromContext();

      this._updateLineSettingsVisibility();

      return;

    }




    if(id===ToolIds.LINE){

      this.activeTool=this.lineTool;

      this.lineTool.activate();

      this._syncSettingsFromContext();

      this._updateLineSettingsVisibility();

      return;

    }

  }




  _resize(){

    const rect=this.canvas.getBoundingClientRect();

    const dpr=window.devicePixelRatio||1;




    this.canvas.width=Math.floor(rect.width*dpr);

    this.canvas.height=Math.floor(rect.height*dpr);

    this.ctx.setTransform(dpr,0,0,dpr,0,0);




    this.renderer.setViewport(rect.width,rect.height);

  }




  _showError(err){

    this.errEl.style.display="block";

    this.errEl.textContent=`FEHLER (Tool läuft weiter):\n${String(err?.stack || err)}`;

  }




  _clearError(){

    this.errEl.style.display="none";

    this.errEl.textContent="";

  }




  _tick(){

    try{

      this._clearError();




      if(this.input.isPanning){

        this.camera.panBy(this.input.panDX,this.input.panDY);

      }




      if(this.input.wheelDelta!==0){

        this.camera.zoomAt(this.input.wheelDelta,this.input.mouse.sx,this.input.mouse.sy);

      }




      this.input.update(this.camera);

      this.activeTool.update(this.input);

      this.renderer.render();

      this.input.endFrame();

    }catch(err){

      this._showError(err);

      try{ this.input.endFrame(); }catch(_){}

    }finally{

      requestAnimationFrame(()=>this._tick());

    }

  }

}

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/19d48151-dcd4-4c45-9cd8-eaae8e5759c1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
