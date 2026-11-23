export interface Pixels{
   data: Uint8ClampedArray;
   width: number;
   height: number;
}


export interface Line{
   y: number;
   thickness: number;
}

export interface Staff{
   top: number;
   bottom: number;
   lines: Line[];
   spacing: number;
}
export interface System{
   top: number;
   bottom: number;
   staffs: Staff[];
   spacing: number;
}

export interface PageDetection{
   imageWidth: number;
   imageHeight: number;
   angle: number;
   threshold: number;
   systems: System[];
}

export interface RowAnalysis {
   y: number;
   density: number;
   longestRun: number;
   runDensity: number;
}

export interface DetectionSettings{
   threshold: number;
   thresholdMode: 'manual' | 'otsu';
   thresholdOffset: number;
   deskew: boolean;
   verticalTolerance: number;
   gapTolerance: number;
   minDensity: number;
   minRunLength: number;
   minRunDensity: number;
}

function binarize(pageOriginal: Pixels, threshold: number): Uint8Array{
      let page = new Uint8Array(pageOriginal.height * pageOriginal.width);
      let totalPixelLength = page.length;
      for(let i = 0; i < totalPixelLength; i++){
         if(pageOriginal.data[i] > threshold){
            page[i] = 0;
         }else{
            page[i] = 1;
         }
      }
      return page;
}

function getRowDensity(mask: Uint8Array, width: number, height: number, gapTolerance: number, verticalTolerance: number = 0): RowAnalysis[]{

   let rowDensities: RowAnalysis[] = [];
   for(let i = 0; i < height; i++){
      let blackPixels = 0;

      // Current run
      let currentRun = 0;
      let currentRunBlackPixels = 0;
      let runStart = -1;
      let gapLength = 0;

      // Longest run
      let longestRun = 0;
      let longestRunBlackPixels = 0;

      for(let j = 0; j < width; j++){
         let index = i * width + j;
         let ink = mask[index] === 1;
         if(!ink && verticalTolerance > 0){
            for(let offset = 1; offset <= verticalTolerance; offset++){
               if((i >= offset && mask[index - offset * width] === 1) ||
                  (i + offset < height && mask[index + offset * width] === 1)){
                  ink = true;
                  break;
               }
            }
         }

         if(ink){
            blackPixels++;
            if (runStart === -1) runStart = j;

            gapLength = 0;
            currentRunBlackPixels++;
            currentRun = j - runStart + 1;
            if(longestRun < currentRun){
               longestRun = currentRun;
               longestRunBlackPixels = currentRunBlackPixels;
            }
         }else if(runStart !== -1){
            gapLength++;

            if(gapLength > gapTolerance){
               currentRun = 0;
               currentRunBlackPixels = 0;
               runStart = -1;
               gapLength = 0;
            }
         }
      }
      rowDensities[i] = {
           y: i,
         density: blackPixels / width,
         longestRun: longestRun,
         runDensity: longestRun > 0
            ? longestRunBlackPixels / longestRun
            : 0
      };
   }
   return rowDensities;
}

function detectLines(rows: RowAnalysis[], width: number, dS: DetectionSettings): Line[]{

   const minDensity = dS.minDensity;
   const minRunLength = dS.minRunLength * width;
   const minRunDensity = dS.minRunDensity;

   let detectedLines: Line[] = [];
   let currentRun = 0;
   let startY = -1;
   
   for(const analysis of rows){
      if(analysis.density >= minDensity && analysis.longestRun >= minRunLength && analysis.runDensity >= minRunDensity){
         // potential line
         if (currentRun === 0){
            startY = analysis.y;
         }
         currentRun++;
      } else {
         if(currentRun > 0){
            detectedLines.push ({
               y: startY + (currentRun - 1) / 2,
               thickness: currentRun
            })
         }
         currentRun = 0;
      }
   }
   if(currentRun > 0){
      detectedLines.push({
         y: startY + (currentRun - 1) / 2,
         thickness: currentRun,
      });
   }
   
   return detectedLines;
}

function greyscale(pageOriginal: Pixels): Pixels{
   let totalPixelLength = pageOriginal.height * pageOriginal.width;
   let data = new Uint8ClampedArray(totalPixelLength);

   for(let i = 0; i < totalPixelLength; i++){
      let index = i * 4;
      let red = pageOriginal.data[index];
      let green = pageOriginal.data[index+1];
      let blue = pageOriginal.data[index+2];
      let alpha = pageOriginal.data[index+3] / 255;
      let grayValue = (0.299 * red) + (0.587 * green) + (0.114 * blue);
      grayValue = grayValue * alpha + 255 * (1 - alpha);

      data[i] = grayValue;
   }

   return { data, width: pageOriginal.width, height: pageOriginal.height };
}

function histogram(page: Pixels): number[]{
   let histogramArray: number[] = new Array(256).fill(0);   

   for(let i = 0; i < page.data.length; i++){
      let brightness = page.data[i];
      histogramArray[brightness]++;
   }
   return histogramArray;
}

function getQuantile(valuesOriginal: number[], quantile: number): number{
   let histogram = structuredClone(valuesOriginal);
   histogram.sort((a,b) => a - b);
   let position = quantile * (histogram.length - 1);

   let upperValue = histogram[Math.ceil(position)];
   let lowerValue = histogram[Math.floor(position)];
   let fraction = position - Math.floor(position);

   let result = lowerValue + (upperValue - lowerValue) * fraction;
   
   return result;

} 

function histogramQuantile(histogramOriginal: number[], quantile: number): number{
   let totalFreq = histogramOriginal.reduce((acc, current) => acc + current, 0);

   let rank = Math.max(1, Math.ceil(totalFreq * quantile));
   
   let cumulativeFreq = 0;

   for(let i = 0; i < histogramOriginal.length; i++){
      cumulativeFreq+=histogramOriginal[i];
      if(cumulativeFreq >= rank){
         return i;
      }
   }
   return -1;
}

function otsuThreshold(histogramOriginal: number[]): number{
   let totalFreq = histogramOriginal.reduce((acc, current) => acc +current, 0);
   let totalSum = 0;
   for(let i = 0; i < 256; i++){
      totalSum+= i*histogramOriginal[i];
   }

   let foregroundSum = 0, backgroundSum = 0, foregroundFreq = 0, backgroundFreq = 0;

   let maxVariance = -1;
   let bestThreshold = 128;
   for (let i = 0; i < 256; i++){
      foregroundSum += i * histogramOriginal[i];
      foregroundFreq += histogramOriginal[i];

      backgroundSum = totalSum - foregroundSum;
      backgroundFreq = totalFreq - foregroundFreq;

      if(foregroundFreq === 0) continue;
      if(backgroundFreq === 0) break;


      let foregroundMean, backgroundMean;
      foregroundMean = foregroundSum/foregroundFreq;
      backgroundMean = backgroundSum/backgroundFreq;

      let weightForeground = foregroundFreq/totalFreq;
      let weightBackground = backgroundFreq/totalFreq;

      let sigmaSqr = weightForeground*weightBackground*(foregroundMean-backgroundMean)**2;

      if (sigmaSqr > maxVariance) {maxVariance = sigmaSqr; bestThreshold = i;}
   }

   return bestThreshold;
}

function thresholdChoices(histogramOriginal: number[]): number[]{
   let otsuThresholdNumber = otsuThreshold(histogramOriginal);
   let histQuantileNumber = histogramQuantile(histogramOriginal, 0.85);
   let diff = histQuantileNumber - otsuThresholdNumber;

   let canidates: number[] = [otsuThresholdNumber, otsuThresholdNumber + .25*diff, otsuThresholdNumber +.5*diff, otsuThresholdNumber + .7*diff, otsuThresholdNumber + .85*diff, otsuThresholdNumber + .95*diff, 128]

   canidates = canidates.map(Math.round);
   canidates = canidates.filter(v => v >= 0);
   canidates = canidates.filter(v => v < histQuantileNumber);

   canidates = [...new Set(canidates)];
   canidates.sort((a, b) => a - b);

   return canidates;

}


interface InkPoint {
   x: number;
   y: number;
   weight: number;
}

function getInkPoints(page: Pixels, threshold: number, stride: number): InkPoint[]{
   let inkPoints: InkPoint[] = [];
   let centerY = (page.height - 1)/2; 
   let centerX = (page.width - 1)/2;
   for(let i = 0; i < page.height; i+=stride){
      for(let j = 0; j < page.width; j+= stride){
         let index = (i * page.width + j);
         let brightness = page.data[index];

         if(brightness > threshold) continue;

         inkPoints.push({
            x: j - centerX,
            y: i - centerY,
            weight: 1 - brightness/255
         });
      }
   }

   return inkPoints;
}

function scoreAngle(inkPoints: InkPoint[], angle: number, width: number, height: number): number{
   let radAngle = angle*(Math.PI/180);
   let sinAngle = Math.sin(radAngle);
   let cosAngle = Math.cos(radAngle);

   let diagLength = Math.sqrt((width**2)+(height**2));

   let projArray = new Float64Array(Math.ceil(diagLength + 4));

   let offset = Math.floor(projArray.length/2);

   for (let point of inkPoints){
      let projPosition = point.x * sinAngle + point.y * cosAngle + offset;

      let lower = Math.floor(projPosition);
      let upper = lower + 1;
      let fraction = projPosition - lower;

      let lowerWeight = point.weight * (1-fraction);
      let upperWeight = point.weight * fraction;

      if(lower >= 0 && lower < projArray.length){
         projArray[lower] += lowerWeight;
      }

      if(upper >= 0 && upper < projArray.length){
         projArray[upper] += upperWeight;
      }
   }
   let score = 0;

   for(let i = 0; i < projArray.length; i++){
      score+=projArray[i]**2
   }

   return score;
}

function estimateSkew(page: Pixels, threshold: number): number{
   let stride = Math.max(1, Math.ceil(Math.sqrt((page.width*page.height)/750000)));

   let inkPoints = getInkPoints(page, threshold, stride);
   if(inkPoints.length < 30) return 0;

   let baseline = scoreAngle(inkPoints, 0, page.width, page.height);;
   let best = baseline;
   let bestAngle = 0;
   
   for(let i = -20; i <= 20; i++){
      let currentScore = scoreAngle(inkPoints, i*0.15, page.width, page.height);

      if(currentScore > best){
         best = currentScore;
         bestAngle = i*0.15;
      }
   }


   let bestCoarseAngle = bestAngle;
   for(let i = -6; i <= 6; i++){
      let currentAngle = bestCoarseAngle + i *0.025;
      let currentScore = scoreAngle(inkPoints, currentAngle, page.width, page.height);

      if(currentScore > best){
         best = currentScore;
         bestAngle = currentAngle;
      }
   }

   if(baseline === 0) return 0;  
   let gain = (best-baseline)/baseline;
   if(gain < 0.015 || Math.abs(bestAngle) < 0.05) return 0;
   return bestAngle;
}

function rotateImage(page: Pixels, angle: number): Pixels{
   if(angle === 0) return page;

   const sourceCanvas = document.createElement('canvas');
   sourceCanvas.width = page.width;
   sourceCanvas.height = page.height;

   
   const sourceCtx = sourceCanvas.getContext('2d');
   if (!sourceCtx) {
      throw new Error('Could not create source canvas context');
   }

   const rgbaData = new Uint8ClampedArray(page.width * page.height * 4);

   for(let i = 0; i < page.data.length; i++){
      let index = i * 4;

      rgbaData[index] = page.data[i];
      rgbaData[index+1] = page.data[i];
      rgbaData[index+2] = page.data[i];
      rgbaData[index+3] = 255;
   }

   sourceCtx.putImageData(
      new ImageData(rgbaData, page.width, page.height),
      0,
      0
   );

   const destCanvas = document.createElement('canvas');
   destCanvas.width = page.width;
   destCanvas.height = page.height;

   const destCtx = destCanvas.getContext('2d');
   if (!destCtx) {
      throw new Error('Could not create destination canvas context');
   }

   destCtx.fillStyle = 'white';
   destCtx.fillRect(0, 0, page.width, page.height);

   const radians = angle * Math.PI / 180;

   destCtx.translate(page.width / 2, page.height / 2);
   destCtx.rotate(radians);

   destCtx.drawImage(
      sourceCanvas,
      -page.width / 2,
      -page.height / 2
   );
   const rotatedData = destCtx.getImageData(
   0, 0, page.width, page.height
   ).data;

   const result = new Uint8ClampedArray(page.width * page.height);

   for(let i = 0; i < result.length; i++){
      result[i] = rotatedData[i * 4];
   }

   return {
      data: result,
      width: page.width,
      height: page.height
   };


   
}
// Most common gap between neighboring lines. Inside a staff there are 4 gaps
// per staff vs 1 gap between staffs, so the mode is the staff line spacing.
// Gaps within +-1px count together so 11 vs 12 rounding doesn't split votes.
function estimateLineSpacing(gaps: number[]): number{
   let best = 0;
   let bestCount = 0;
   for(const candidate of gaps){
      let count = 0;
      for(const gap of gaps){
         if(Math.abs(gap - candidate) <= 1) count++;
      }
      if(count > bestCount){
         bestCount = count;
         best = candidate;
      }
   }
   return best;
}

function gapsAreConsistent(gaps: number[], spacing: number): boolean{
   let min = Math.min(...gaps);
   let max = Math.max(...gaps);
   if(min < spacing * 0.5 || max > spacing * 1.5) return false;
   return max - min <= Math.max(2, min * 0.25);
}

function detectStaffs(linesOriginal: Line[], rows: RowAnalysis[]): Staff[]{
   if(linesOriginal.length === 0) return [];

   let lines = [...linesOriginal].sort((a, b) => a.y - b.y);

   // A broken thick line can come out of detectLines as two lines a row or so
   // apart. Merge those back into one.
   let typicalThickness = getQuantile(lines.map(l => l.thickness), 0.5);
   let mergeGap = Math.max(1, Math.round(typicalThickness / 2));

   let merged: Line[] = [];
   for(const line of lines){
      let last = merged[merged.length - 1];
      if(last){
         let lastBottom = last.y + (last.thickness - 1) / 2;
         let lineTop = line.y - (line.thickness - 1) / 2;
         let emptyRows = lineTop - lastBottom - 1;
         if(emptyRows <= mergeGap){
            let top = last.y - (last.thickness - 1) / 2;
            let bottom = line.y + (line.thickness - 1) / 2;
            merged[merged.length - 1] = {
               y: (top + bottom) / 2,
               thickness: bottom - top + 1
            };
            continue;
         }
      }
      merged.push(line);
   }

   let gaps: number[] = [];
   for(let i = 1; i < merged.length; i++){
      gaps.push(merged[i].y - merged[i - 1].y);
   }
   // 0 when there's only one line on the page (a lone percussion staff).
   let spacing = estimateLineSpacing(gaps);

   let staffs: Staff[] = [];
   let used: boolean[] = new Array(merged.length).fill(false);

   // Pass 1: claim every complete 5-line staff first, so a nearby stray or
   // percussion line can't steal lines from it in pass 2.
   if(spacing > 0){
      let i = 0;
      while(i + 4 < merged.length){
         if(gapsAreConsistent(gaps.slice(i, i + 4), spacing)){
            staffs.push(makeStaff(merged.slice(i, i + 5), spacing));
            for(let j = i; j < i + 5; j++) used[j] = true;
            i += 5;
         }else{
            i++;
         }
      }
   }

   // Pass 2: a staff is either 5 lines or 1 line (percussion), never 2-4.
   // So leftover lines that sit on a common spacing grid are a 5-line staff
   // with missing lines, and a leftover line on its own is a percussion staff.
   let run: Line[] = [];
   for(let i = 0; i <= merged.length; i++){
      if(i < merged.length && !used[i]){
         run.push(merged[i]);
         continue;
      }
      for(const group of groupOnGrid(run, spacing)){
         if(group.lines.length === 1){
            // A very thick lone line is a border or rule, not a staff line.
            if(group.lines[0].thickness > Math.max(3, typicalThickness * 3)) continue;
            staffs.push(makeStaff(group.lines, spacing));
         }else{
            staffs.push(completeStaff(group, rows, typicalThickness));
         }
      }
      run = [];
   }

   staffs.sort((a, b) => a.top - b.top);
   return staffs;
}

interface GridGroup {
   lines: Line[];
   slots: number[];   // grid position of each line, first line is slot 0
   lineSpacing: number;
}

// Groups consecutive lines that land on a regular grid (gaps that are whole
// multiples of the line spacing) and span no more than one staff (4 steps).
function groupOnGrid(lines: Line[], pageSpacing: number): GridGroup[]{
   let groups: GridGroup[] = [];
   let current: GridGroup | null = null;

   for(const line of lines){
      if(current && pageSpacing > 0){
         let last = current.lines[current.lines.length - 1];
         let span = current.slots[current.slots.length - 1];
         let gap = line.y - last.y;

         let fits = false;
         let steps = 0;
         if(current.lines.length === 1){
            // First gap: compare to the page spacing loosely, since this staff
            // may be a smaller cue staff.
            steps = Math.max(1, Math.round(gap / pageSpacing));
            fits = Math.abs(gap / steps - pageSpacing) <= pageSpacing * 0.3;
         }else{
            steps = Math.max(1, Math.round(gap / current.lineSpacing));
            fits = Math.abs(gap - steps * current.lineSpacing) <= Math.max(2, current.lineSpacing * 0.2);
         }

         if(fits && span + steps <= 4){
            current.lines.push(line);
            current.slots.push(span + steps);
            current.lineSpacing = (line.y - current.lines[0].y) / (span + steps);
            continue;
         }
      }

      if(current) groups.push(current);
      current = { lines: [line], slots: [0], lineSpacing: pageSpacing };
   }
   if(current) groups.push(current);

   return groups;
}

// Ink in the rows around y. Used to find faint lines that didn't pass
// detectLines but still left some ink behind.
function inkNear(rows: RowAnalysis[], y: number): number{
   let best = 0;
   for(let offset = -1; offset <= 1; offset++){
      let row = rows[y + offset];
      if(row) best = Math.max(best, row.density);
   }
   return best;
}

// Fills a 2-4 line group out to 5 lines. Missing middle lines have only one
// possible spot. Missing top/bottom lines could go on either side, so try each
// placement and keep the one with the most leftover ink where the inferred
// lines would be.
function completeStaff(group: GridGroup, rows: RowAnalysis[], thickness: number): Staff{
   let first = group.lines[0].y;
   let g = group.lineSpacing;
   let span = group.slots[group.slots.length - 1];

   let bestOffset = 0;
   let bestScore = -Infinity;
   for(let offset = 0; offset <= 4 - span; offset++){
      let score = 0;
      for(let slot = 0; slot < 5; slot++){
         if(group.slots.includes(slot - offset)) continue;
         let y = Math.round(first + (slot - offset) * g);
         if(y < 0 || y >= rows.length){
            score = -Infinity;   // a staff can't run off the page
            break;
         }
         score += inkNear(rows, y);
      }
      if(score > bestScore){
         bestScore = score;
         bestOffset = offset;
      }
   }

   let lines: Line[] = [];
   for(let slot = 0; slot < 5; slot++){
      let index = group.slots.indexOf(slot - bestOffset);
      if(index !== -1){
         lines.push(group.lines[index]);
      }else{
         lines.push({
            y: first + (slot - bestOffset) * g,
            thickness: Math.round(thickness)
         });
      }
   }

   return makeStaff(lines, g);
}

// A percussion staff has 1 line, so its spacing comes from the page instead.
function makeStaff(lines: Line[], pageSpacing: number): Staff{
   let top = lines[0].y;
   let bottom = lines[lines.length - 1].y;
   return {
      top,
      bottom,
      lines,
      spacing: lines.length > 1 ? (bottom - top) / (lines.length - 1) : pageSpacing
   };
}

// Two staffs belong to the same system when some column has ink across
// (almost) the whole gap between them, i.e. a barline or the system's left
// connector line runs from one to the other.
function staffsConnected(upper: Staff, lower: Staff, mask: Uint8Array, width: number): boolean{
   let startY = Math.round(upper.bottom);
   let endY = Math.round(lower.top);
   let rows = endY - startY + 1;
   if(rows <= 0) return true;

   let needed = rows * 0.9;
   for(let x = 0; x < width; x++){
      let ink = 0;
      for(let y = startY; y <= endY; y++){
         ink += mask[y * width + x];
      }
      if(ink >= needed) return true;
   }
   return false;
}

function detectSystems(staffs: Staff[], mask: Uint8Array, width: number): System[]{
   if(staffs.length === 0) return [];

   let connected: boolean[] = [];
   let connectedGaps: number[] = [];
   for(let i = 1; i < staffs.length; i++){
      let isConnected = staffsConnected(staffs[i - 1], staffs[i], mask, width);
      connected.push(isConnected);
      if(isConnected) connectedGaps.push(staffs[i].top - staffs[i - 1].bottom);
   }

   // Fallback for a barline that broke up in the scan: if a pair isn't
   // connected but sits no farther apart than the connected pairs usually do,
   // treat it as connected. With no connected pairs at all (a single
   // instrument part), every staff stays its own system.
   if(connectedGaps.length > 0){
      let typicalConnectedGap = getQuantile(connectedGaps, 0.5);
      for(let i = 1; i < staffs.length; i++){
         let gap = staffs[i].top - staffs[i - 1].bottom;
         if(!connected[i - 1] && gap <= typicalConnectedGap){
            connected[i - 1] = true;
         }
      }
   }

   let systems: System[] = [];
   let current: Staff[] = [staffs[0]];
   for(let i = 1; i < staffs.length; i++){
      if(connected[i - 1]){
         current.push(staffs[i]);
      }else{
         systems.push(makeSystem(current));
         current = [staffs[i]];
      }
   }
   systems.push(makeSystem(current));

   return systems;
}

// spacing = average gap between the bottom of one staff and the top of the
// next inside this system (0 for a single-staff system).
function makeSystem(staffs: Staff[]): System{
   let totalGap = 0;
   for(let i = 1; i < staffs.length; i++){
      totalGap += staffs[i].top - staffs[i - 1].bottom;
   }
   return {
      top: staffs[0].top,
      bottom: staffs[staffs.length - 1].bottom,
      staffs,
      spacing: staffs.length > 1 ? totalGap / (staffs.length - 1) : 0
   };
}
const defaultSettings: DetectionSettings = {
   threshold: 190,
   thresholdMode: 'manual',
   thresholdOffset: 25,
   deskew: true,
   verticalTolerance: 0,
   gapTolerance: 3,
   minDensity: 0.4,
   minRunLength: 0.4,
   minRunDensity: 0.85
};



//* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export function detect(page:Pixels, customSettings: Partial<DetectionSettings> = {}): PageDetection{

   const settings: DetectionSettings = {
      ...defaultSettings,
      ...customSettings
   };
   
   const greyscaleCopy = greyscale(page);

   const brightnessHistogram = histogram(greyscaleCopy);
   const thresholds = thresholdChoices(brightnessHistogram);

   const skewThreshold = thresholds[Math.floor(thresholds.length * 0.65)]
      ?? settings.threshold;

   const angle = settings.deskew
      ? estimateSkew(greyscaleCopy, skewThreshold)
      : 0;

   const correctedPage = rotateImage(greyscaleCopy, angle);

   const threshold = settings.thresholdMode === 'otsu'
      ? Math.min(255, Math.max(0, otsuThreshold(brightnessHistogram) + settings.thresholdOffset))
      : settings.threshold;

   const binaryCopy = binarize(correctedPage, threshold);

   const rowAnalysis = getRowDensity(
      binaryCopy,
      correctedPage.width,
      correctedPage.height,
      settings.gapTolerance,
      settings.verticalTolerance
   );

   const detectedLines = detectLines(
      rowAnalysis,
      correctedPage.width,
      settings
   );

   const staffs = detectStaffs(detectedLines, rowAnalysis);

   const systems = detectSystems(
      staffs,
      binaryCopy,
      correctedPage.width
   );

   return {
      imageWidth: correctedPage.width,
      imageHeight: correctedPage.height,
      angle,
      threshold,
      systems
   };
}



