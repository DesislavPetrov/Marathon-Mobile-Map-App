            var mymap;
            var lyrWS100;
            var lyrOSM;
            var lyrTopo;
            var lyrImagery;
            var ctlAttribute;
            var ctlScale;
            var ctlSidebar;
            var ctlSidebarToggle;
            var ctlLayers;
            var objBasemaps;
            var objOverlays;
            var jsnRoute;
            var jsnPoints;
            var jsnElev
            var myChart;
            var mrkCurrent;
            var numUnitMultiplier=0.62;
            var strUnit = "mi";
            var numUnitMultiplierSmall=3.28;
            var strUnitSmall = "ft";
            var intPosition;
            var dtLastPosition = new Date();
            
            $(document).ready(function(){
                
                //**********  Initialize map *************
                mymap = L.map('mapdiv', {attributionControl:false});
                mymap.setView([39.1, -120.7], 10);
                
                // ******** Map events ************

                mymap.on("locationfound", function(e){
                    processPosition(e.latlng);
                    dtLastPosition = new Date();
                    $("#posInfo").html("+/-" + e.accuracy.toFixed(1) + "m");
                    $("#buttonPositionToggle").css('color', 'green');
                })

                mymap.on("locationerror", function(e){
                    $("#buttonPositionToggle").css('color', 'red');
                    var dt = new Date();
                    var interval = dt - dtLastPosition;
                    $("#posInfo").html((interval/1000).toFixed(0)+"s");
                })

                // ******** Map timers ************

                intPosition = setInterval(function(){
                    mymap.locate({enableHighAccuracy: true}, 6000);
                })

                mymap.on('contextmenu', function(e) {
                    //  Recalculate position information on right click
                    processPosition(e.latlng);         
                });

                //********** Initialize map controls
                ctlAttribute = L.control.attribution().addTo(mymap);
                ctlAttribute.addAttribution('&copy; <a href="http://geocadder.bg/en">GEOCADDER</a>');
                ctlScale = L.control.scale({position:'bottomright', metric:true, imperial: false,maxWidth:200}).addTo(mymap);
                ctlSidebar = L.control.sidebar('sidebar', {closeButton:false}).addTo(mymap);
                ctlSidebarToggle = L.easyButton( 'glyphicon-log-in', function(){
                    ctlSidebar.show();
                }).addTo(mymap);
                
                //********** Initialize layers ************
                lyrOSM = L.tileLayer.provider('OpenStreetMap.Mapnik');
                lyrTopo = L.tileLayer.provider('OpenTopoMap');
                lyrImagery = L.tileLayer.provider('Esri.WorldImagery');

                lyrWSRoute = L.geoJSON.ajax('data/ws100.geojson', {style:{color:'red'}}).addTo(mymap);
                lyrWSRoute.on('data:loaded', function(){
                    
                    // Get the first feature in the ws100.geojson file
                    var arLayers=lyrWSRoute.getLayers();
                    jsnRoute = arLayers[0].toGeoJSON();
                    
                    // Get the first line in the multi-line
                    jsnRoute = turf.flatten(jsnRoute).features[0];
                    
                    // Get the elevation data for the line
                    $.getJSON( "data/ws100_elev.json", function( data ) {
                        jsnElev = data;
                        
                        // Get the aid station points
                        lyrWSPoints = L.geoJSON.ajax('data/ws100_aid.geojson', {pointToLayer:processPoints}).addTo(mymap);
                        lyrWSPoints.on('data:loaded', function(){
                            jsnPoints = lyrWSPoints.toGeoJSON();
                            
                            // Create the elevation chart with aid stations
                            drawChart();
                            
                            //********** Initialize layer control ************ 
                            objBasemaps = {
                                "Open Street Maps": lyrOSM,
                                "Topo Map":lyrTopo,
                                "Imagery":lyrImagery
                            };

                            objOverlays = {
                                "WS100 Course":lyrWSRoute,
                                "WS100 Aid Stations":lyrWSPoints
                            };

                            ctlLayers = L.control.layers(objBasemaps, objOverlays).addTo(mymap);

                            mymap.addLayer(lyrTopo);
                        });
                    });
                });
            });
            
            function processPoints(feature, ll) {
                // Run on each aid station point as it is read in from the geojson file
                
                // Locate the point on the route that is closest to the point (i.e. snapped to the line)
                var ptSnapped = turf.pointOnLine(jsnRoute, [ll.lng, ll.lat]);
                
                // Add properties to the aid staation features
                feature.properties.type="Aid Station";
                
                // Add the location property  (i.e. distance in miles from the start of the course)
                feature.properties.location = Number((ptSnapped.properties.location*numUnitMultiplier).toFixed(1));
                
                // Add the elevation property (based on the nearest elevation in the line elevation data)
                feature.properties.elevation = findNearestElevation(ptSnapped.properties.location*numUnitMultiplier);
                
                // Return a marker for the aid station with a popup
                return L.circleMarker(ll, {radius:10, color:'darkmagenta', weight:4}).bindPopup("<h4>"+feature.properties.name+"</h4>Type: "+feature.properties.type+"<br>Location: "+feature.properties.location+"<br>Elevation: "+feature.properties.elevation+"<br><a onclick='zoomAid("+feature.properties.location+")'>Zoom</a>");
            }

            function findNearestElevationPoint(numLoc) {
                // Find the nearest elevation in the elevation data to a given location 

                // This is required to place the aid station on the elevation chart as a tooltip
                var numClosest = jsnElev[0][0];
                var numMin = Math.abs(numLoc-numClosest);
                for (var j=0;j<jsnElev.length;j++){
                    var numDist = Math.abs(numLoc-jsnElev[j][0]);
                    if (numDist<numMin) {
                        numMin=numDist;
                        numClosest = jsnElev[j][0]
                    }
                }
                return numClosest;
            }
            
            function findNearestElevation(numLoc) {
                // Find the elevation of the nearest elevation point to a given location

                // Used to calculate elevation at given points along the line.
                var numClosest = jsnElev[0][0];
                var numElev = jsnElev[0][1];
                var numMin = Math.abs(numLoc-numClosest);
                for (var j=0;j<jsnElev.length;j++){
                    var numDist = Math.abs(numLoc-jsnElev[j][0]);
                    if (numDist<numMin) {
                        numMin=numDist;
                        numClosest = jsnElev[j][0]
                        numElev = jsnElev[j][1]
                    }
                }
                return numElev;
            }
            
            function drawChart() {
                // Determine the current width of the elevation profile div
                var strWidth = $("#divElevationProfileDetail").css("width")
                var numWidth = Number(strWidth.substring(0,strWidth.indexOf("px")))+25;
                
                // Create a reference to a line chart and set the data array
                myChart = new JSChart('divElevationProfileDetail', 'line', '');
                myChart.setDataArray(jsnElev);
                
                // Modify the chart settings
                myChart.setSize(numWidth, 250);
                myChart.setIntervalEndY(9000);
                myChart.setIntervalStartY(0);
                myChart.setIntervalEndX(100);
                myChart.setIntervalStartX(0);
                myChart.setAxisNameX('Miles')
                myChart.setAxisNameY('')
                myChart.setAxisValuesNumberY(10);
                myChart.setAxisValuesNumberX(11);
                myChart.setTitle('');
                myChart.setTitleFontSize(10);
                myChart.setTitleColor('#424342');
                myChart.setAxisValuesColor('#444444');
                myChart.setLineColor('#FF0000');
                myChart.setFlagRadius(8);
                myChart.setFlagColor('#8B008B');
                myChart.setFlagWidth(3);
                myChart.setTextPaddingTop(0);
                myChart.setLineSpeed(100);
                
                // Loop through the aid station points and create a tooltip for each one.
                for (var i=0;i<jsnPoints.features.length;i++) {
                    var numLoc = findNearestElevationPoint(jsnPoints.features[i].properties.location);
                    myChart.setTooltip([numLoc, jsnPoints.features[i].properties.name]);
                }
                
                myChart.draw();

            }
            
            function zoomAid(numLoc) {
                //Zoom the map and the elevation profile to center at a given location (distance from the start of the line)
                
                // find the coordiantes at the specified distance an zoom to it
                var ptSnapped = turf.along(jsnRoute, numLoc/numUnitMultiplier);
                mymap.setView([ptSnapped.geometry.coordinates[1],ptSnapped.geometry.coordinates[0]], 14);
                
                // set the width of the elevation profile to the width of the sidebar
                var strWidth = $("#divElevationProfileDetail").css("width")
                var numWidth = Number(strWidth.substring(0,strWidth.indexOf("px")))+25;
                myChart.setSize(numWidth, 250);
                
                // set the bounds of the elevation profile to 10 miles before and after the point
                var numStart = Math.ceil(numLoc-10);
                if (numStart<0) {
                    numStart=0;
                }
                myChart.setIntervalStartX(numStart);
                myChart.setIntervalEndX(numStart+20);
                
                myChart.draw();
            }
            
            function processPosition(ll) {
                // Update the map and sidebar position information based on a specified point
                
                // Get the point on the line closest to the specified position
                var ptSnapped = turf.pointOnLine(jsnRoute, [ll.lng, ll.lat]);
                // Get the location (distance from start of the line)
                var numLoc = ptSnapped.properties.location
                // Get the distance from the specified position to the line
                var numDist = ptSnapped.properties.dist
                
                // Update the position marker on the map
                if (mrkCurrent) {
                    mrkCurrent.remove();
                }
                mrkCurrent = L.circleMarker(ll, {radius:10}).addTo(mymap);
                
                // Update the latitude, longitude, and elevation values
                $("#txtLatitude").html(ll.lat.toFixed(5));
                $("#txtLongitude").html(ll.lng.toFixed(5));
                $("#txtAltitude").html(findNearestElevation(numLoc*numUnitMultiplier)+" ft");
                
                // Update the distance from start and distance to end values
                $("#txtFromStart").html((numLoc*numUnitMultiplier).toFixed(2)+" "+strUnit);
                $("#txtToFinish").html(((turf.lineDistance(jsnRoute)-numLoc)*numUnitMultiplier).toFixed(2)+" "+strUnit);
                
                // Update the distance and direction to the trail from the specified position
                $("#txtToTrail").html((numDist*1000*numUnitMultiplierSmall).toFixed(0)+" "+strUnitSmall);
                var numBearing=turf.bearing([ll.lng, ll.lat], ptSnapped);
                if (numBearing<0) {
                    numBearing = numBearing+360;
                }
                $("#txtBearing").html(numBearing.toFixed(0)+" o");
                
                // Highlight the distance value if further than 500 feet from the line
                if (numDist>0.152) {
                    $("#txtToTrail").css('background-color', 'salmon');
                } else {
                    $("#txtToTrail").css('background-color', 'white');
                }
                
                // Zoom and center both the map and elevation profile around the specified position
                zoomAid(numLoc*numUnitMultiplier)
                
                // Loop through the aid stations and calculate the distance, direction, and elevation change to them from the specified position
                var strTable = "<table class='table table-striped'><tr><th>Name</th><th class='right'>Distance</th><th class='right'>Elevation</th><th class='right'>Direct</th></tr>";
                for (var i=0;i<jsnPoints.features.length;i++){
                    var ptCurrent = jsnPoints.features[i];
                    // Calculate the distance along the trail to the aid station
                    var numTrailDist = ptCurrent.properties.location-(numLoc*numUnitMultiplier);
                    // Only show aid stations from five miles back to the end of the route
                    if (numTrailDist>-5) {
                        // Calculate the distance and direction to the aid station "as the crow flies"
                        var numDirectDist = ll.distanceTo([ptCurrent.geometry.coordinates[1],ptCurrent.geometry.coordinates[0]]);
                        var numBearing = turf.bearing([ll.lng, ll.lat], ptCurrent);
                        if (numBearing<0) {
                            numBearing=numBearing+360;
                        }
                        
                        // Add table row for the aid station 
                        strTable += "<tr><td>"+ptCurrent.properties.name+"</td><td class='right'>"+numTrailDist.toFixed(2)+"</td><td class='right'>"+returnElevChange(numLoc*numUnitMultiplier, ptCurrent.properties.location)+"</td><td class='right'>"+(numDirectDist/1000*numUnitMultiplier).toFixed(2)+" @ "+numBearing.toFixed(0)+"</td></tr>";
                    }
                }
                strTable += "</table>";
                $("#divAidTableDetail").html(strTable);
            }
            
            function returnElevChange(numLocStart,numLocEnd) {
                // Calculate the elevation change between two locations along the line and return as a string
                var numAccumUp=0;
                var numAccumDown=0;
                for (var i=0;i<(jsnElev.length-1);i++) {
                    if (jsnElev[i][0]>numLocStart && jsnElev[i][0]<numLocEnd){
                        var numNet = jsnElev[i+1][1]-jsnElev[i][1];
                        if (numNet<0) {
                            numAccumDown = numAccumDown-numNet;
                        } else {
                            numAccumUp = numAccumUp+numNet;
                        }
                    }
                }
                return "+"+numAccumUp.toFixed(0)+"/ -"+numAccumDown.toFixed(0);
            }
            
            //*******  jQuery event handlers
            
            $("#btnSidebarToggle").click(function(){
                ctlSidebar.hide();
            });
            
            $("#btnPositionToggle").click(function(){
                $("#divPositionDetail").toggle();
            });
            
            $("#btnElevationToggle").click(function(){
                $("#divElevationProfileDetail").toggle();
            });
            
            $("#btnElevationZoomOut").click(function(){
                // set the width of the elevation profile to the width of the sidebar
                var strWidth = $("#divElevationProfileDetail").css("width")
                var numWidth = Number(strWidth.substring(0,strWidth.indexOf("px")))+25;
                myChart.setSize(numWidth, 250);
                
                myChart.setIntervalStartX(0);
                myChart.setIntervalEndX(100);
                myChart.draw();
            });
            
            $("#btnElevationZoomIn").click(function(){
                var ptSnapped = turf.pointOnLine(jsnRoute, mrkCurrent.toGeoJSON());
                zoomAid(ptSnapped.properties.location*numUnitMultiplier);
            });
            
            $("#btnTableToggle").click(function(){
                $("#divAidTableDetail").toggle();
            });