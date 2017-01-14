<html>
  <head>
    <meta name="description" content="Weather!">
    <meta name="author" content="Ethan Elliott">
    <link rel="author" href="https://plus.google.com/+EthanElliott29">

    <!-- Google Authorship and Publisher Markup -->
    <link rel="author" href=" https://plus.google.com/+EthanElliott29/posts">
    <link rel="publisher" href=" https://plus.google.com/+EthanElliott29">

    <!-- Schema.org markup for Google+ -->
    <meta itemprop="name" content="Ethan Elliott | Home">
    <meta itemprop="description" content="Ethan Elliott">
    <meta itemprop="image" content="/favicon.ico">

    <!-- Twitter Card data -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:site" content="@EthanElliott29">
    <meta name="twitter:title" content="Ethan Elliott | Home">
    <meta name="twitter:description" content="Ethan Elliott">
    <meta name="twitter:creator" content="@EthanElliott29">

    <!-- Open Graph data -->
    <meta property="og:title" content="Ethan Elliott | Home">
    <meta property="og:type" content="article">
    <meta property="og:url" content=" http://www.ethanelliott.ca/">
    <meta property="og:image" content="/favicon.ico">
    <meta property="og:description" content="Ethan Elliott">
    <meta property="og:site_name" content="EthanElliott.ca">

    <script src="/analytics.js"></script>
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="theme-color" content="#530075">
    <style>
    @import url(http://fonts.googleapis.com/css?family=Roboto:400,100,300,500,700,900,400italic,700italic,300italic);
    * {
      padding:0;
      margin:0;
      font-family: 'Roboto', sans-serif;
      font-size: 1.8vh;
    }
    body {
      background: #eeeeee;
    }
    header {
      position: fixed;
      top:0;
      left:0;
      width:100vw;
      height:10vh;
      background: #530075;
      text-align: center;
      box-shadow: 0px 4px 12px 0px #555555;
      border-bottom: 1px solid #530075;
      z-index:100000;
    }

    header > h1 {
      color:white;
      font-size:8vh;
      font-weight: 200;
      line-height: 10vh;
    }

    main {
      margin:auto;
      margin-top:10vh;
      padding:2vh 2vw;
      /*display:none;*/
    }
    main > #card, #teamDataTable > #card{
      width:90vw;
      max-width: 800px;
      margin:auto auto;
      margin-top:3vh;
      margin-bottom:3vh;
      background:#FFFFFF;
      border:1px solid #eeeeee;
      box-shadow: 0px 4px 10px 0px #888888;
      border-radius: 3px;
    }
    .header {
      width:100%;
      font-size:2em;
      margin-bottom:2vh;
      padding-top:2vh;
      text-align: center;
    }
    #card  select {
      width:100%;
      padding:1em 1em;
      font-size:1em;
      border-radius: 5px;
      border:0px solid #eeeeee;
    }

    #card.eventData {
      display: none;
    }

    #qualMatchSchedule, #QuarterFinalMatchSchedule, #SemiFinalMatchSchedule, #FinalMatchSchedule {
      border-collapse: collapse;
      width:100%;
      margin:auto;
      margin-top: 2vh;
      margin-bottom: 2vh;
      text-align: center;
    }

    #qualMatchSchedule tr:nth-child(even), #QuarterFinalMatchSchedule tr:nth-child(even), #SemiFinalMatchSchedule tr:nth-child(even), #FinalMatchSchedule tr:nth-child(even) {
      background-color: #f2f2f2;
    }

    #qualMatchSchedule th, #QuarterFinalMatchSchedule th, #SemiFinalMatchSchedule th, #FinalMatchSchedule th {
      border:1px solid white;
      padding-top:2vh;
      padding-bottom:2vh;
      background: #000000;
      color:#FFFFFF;
    }

    #qualMatchSchedule td, #QuarterFinalMatchSchedule td, #SemiFinalMatchSchedule td, #FinalMatchSchedule td {
      border:1px solid black;
      padding-top:1vh;
      padding-bottom:1vh;
    }

    #scoresChart {
      width:100%;
      height:30vh;
    }

    footer {
      margin:auto;
      margin-bottom:2vh;
      text-align: center;
      width:80vw;
    }
    </style>

    <script type="text/javascript" src="https://www.google.com/jsapi"></script>
    <script type="text/javascript" src="http://code.jquery.com/jquery-latest.min.js"></script>
    <script type="text/javascript" src="canvasjs.min.js"></script>
    <script>
    function pad(num, size)
    {
      var s = num+"";
      while (s.length < size) s = "0" + s;
      return s;
    }
    function cTime(epochTime)
    {
    	var dOfW = "";
    	var myDate = new Date(epochTime * 1000);
    	if (myDate.getDay() == 0)
    	{
    		dOfW = "Sun";
    	}
    	else if (myDate.getDay() == 1)
    	{
    		dOfW = "Mon";
    	}
    	else if (myDate.getDay() == 2)
    	{
    		dOfW = "Tue";
    	}
    	else if (myDate.getDay() == 3)
    	{
    		dOfW = "Wed";
    	}
    	else if (myDate.getDay() == 4)
    	{
    		dOfW = "Thu";
    	}
    	else if (myDate.getDay() == 5)
    	{
    		dOfW = "Fri";
    	}
    	else if (myDate.getDay() == 6)
    	{
    		dOfW = "Sat";
    	}
    	return dOfW + " " + pad(myDate.getHours(),2) + ":" + pad(myDate.getMinutes(),2);
    }

    function teamCode(code)
    {
    	var s = code.split("frc");
    	return parseInt(s[1]);
    }

    function sortTeams(arr)
    {
      var n = arr.length;
      for (i = 1; i < n; i++)
      {
        for (j = 0; j < (n-i); j++)
        {
          if (arr[j].team_number > arr[j+1].team_number)
          {
            var tempArray = arr[j];
            arr[j] = arr[j+1];
            arr[j+1] = tempArray;
          }
        }
      }
    }

    function sortMatches(arr)
    {
      var n = arr.length;
      for (i = 1; i < n; i++)
      {
        for (j = 0; j < (n-i); j++)
        {
          if (arr[j].time > arr[j+1].time)
          {
            var tempArray = arr[j];
            arr[j] = arr[j+1];
            arr[j+1] = tempArray;
          }
        }
      }
    }

    function load(){

      var scores = new CanvasJS.Chart("scoresChart",
      {
        animationEnabled: true,
          axisX: {
            gridColor: "#000000",
            gridThickness: 2,
            labelFontSize: 1,
            labelFontColor: "black"
          },
          axisY:{
              gridColor: "#000000",
              labelFontSize: 10,
              labelFontColor: "black"
          },
          data: [
          {
            type: "spline",
            markerType: "none",
            color: "#ff0000",
            name: "Score",
            lineThickness: 2,
            dataPoints: [
            ]
          }
        ]
        });

      $.getJSON("https://www.thebluealliance.com/api/v2/events/2016?X-TBA-App-Id=EthanE:datascraper:v01", function( data ) {
        //console.log(data);
        var out = "";
        out += '<form action="javascript:void(0)">';
        out += '<select class="event">';
        var numEvents = data.length;
        out += '<option value="NULL">Select an event...</option>';
        for (i = 0; i < numEvents; i++)
        {
          out += '<option value="' + data[i].key + '">' + data[i].name + '</option>';
        }
        out += "</select>";
        out += "</form>";
        $("#eventSelectForm").html(out);
        $(".event").change(function() {
          $(".teamSelect").css({"display":"none"});
          var eventKey = $("select.event").val();
          if(eventKey != "NULL")
          {
            $.getJSON("https://www.thebluealliance.com/api/v2/event/" + eventKey + "/teams?X-TBA-App-Id=EthanE:datascraper:v01", function( teams ) {
              $(".teamSelect").css({"display":"block"});
              var ou = "";
              sortTeams(teams);
              ou += '<form action="javascript:void(0)">';
              ou += '<select class="team">';
              var lengthArr = teams.length;
              ou += '<option value="NULL">Select a team...</option>';
              for (i = 0; i < lengthArr; i++)
              {
                ou += '<option value="' + teams[i].key + '">' + teams[i].team_number + " " + teams[i].nickname + '</option>';
              }
              ou += "</select>";
              ou += "</form>";
              $("#teamSelectForm").html(ou);
              $(".team").change(function() {
                var teamKey = $("select.team").val();
                if(teamKey != "NULL")
                {
                  $.getJSON("https://www.thebluealliance.com/api/v2/event/" + eventKey + "/matches?X-TBA-App-Id=EthanE:datascraper:v01", function( matches ) {
                    sortMatches(matches);
                    var numMatches = matches.length;
                    var f = new Array();
                    var sf = new Array();
                    var qf = new Array();
                    var qm = new Array();
                    var teamMatches = new Array();
                    for (i = 0; i < numMatches; i++)
                    {
                      if (matches[i].comp_level === "f") {
                        f.push(matches[i]);
                      } else if (matches[i].comp_level === "sf") {
                        sf.push(matches[i]);
                      } else if (matches[i].comp_level === "qf") {
                        qf.push(matches[i]);
                      } else if (matches[i].comp_level === "qm") {
                        qm.push(matches[i]);
                      }
                      if (matches[i].alliances.red.teams[0] === teamKey || matches[i].alliances.red.teams[1] === teamKey || matches[i].alliances.red.teams[2] === teamKey || matches[i].alliances.blue.teams[0] === teamKey || matches[i].alliances.blue.teams[1] === teamKey || matches[i].alliances.blue.teams[2] === teamKey){
                        teamMatches.push(matches[i]);
                      }
                    }
                    scores.options.data[0].dataPoints = [];
                    for (i=0; i < teamMatches.length; i++)
                    {
                      if (teamMatches[i].comp_level === "qm")
                      {
                        var yDat = 0;
                        var xLabel = teamMatches[i].comp_level + teamMatches[i].match_number;
                        if (teamMatches[i].alliances.red.teams[0] == teamKey || teamMatches[i].alliances.red.teams[1] == teamKey || teamMatches[i].alliances.red.teams[2] == teamKey)
                        {
                          yDat = teamMatches[i].alliances.red.score;
                        }
                        else
                        {
                          yDat = teamMatches[i].alliances.blue.score;
                        }
                        scores.options.data[0].dataPoints.push({ y: yDat , label: xLabel});
                      }
                    }
                    var tout = "";
                    tout += '<div id="card" class="eventData"><div class="header">Qualification Matches</div><table id="qualMatchSchedule">';
                    tout += '<tr>';
                    tout += '<th>#</th>';
                    tout += '<th>Time</th>';
                    tout += '<th colspan="3">Red Alliance</th>';
                    tout += '<th colspan="3">Blue Alliance</th>';
                    tout += '<th>Red Score</th>';
                    tout += '<th>Blue Score</th>';
                    tout += '</tr>';
                    for (i = 0; i < qm.length; i++)
                    {
                      var rowID = qm[i].key;
                      var redWin, blueWin;
                      if (qm[i].alliances.red.score > qm[i].alliances.blue.score) {
                        redWin = "win";
                        blueWin = "loss";
                      } else if(qm[i].alliances.red.score < qm[i].alliances.blue.score) {
                        redWin = "loss";
                        blueWin = "win";
                      }
                      var teamClassString = qm[i].alliances.red.teams[0] + 'red ' + qm[i].alliances.red.teams[1] + 'red ' + qm[i].alliances.red.teams[2] + 'red ' + qm[i].alliances.blue.teams[0] + 'blue ' + qm[i].alliances.blue.teams[1] + 'blue ' + qm[i].alliances.blue.teams[2] + 'blue';
                      tout += '<tr id = "' + rowID + '" class="' + teamClassString + '">';
                      tout += '<td>' + qm[i].match_number + '</td>';
                      tout += '<td>' + cTime(qm[i].time) + '</td>';
                      tout += '<td class="' + qm[i].alliances.red.teams[0] + '">' + teamCode(qm[i].alliances.red.teams[0]) + '</td>';
                      tout += '<td class="' + qm[i].alliances.red.teams[1] + '">' + teamCode(qm[i].alliances.red.teams[1]) + '</td>';
                      tout += '<td class="' + qm[i].alliances.red.teams[2] + '">' + teamCode(qm[i].alliances.red.teams[2]) + '</td>';
                      tout += '<td class="' + qm[i].alliances.blue.teams[0] + '">' + teamCode(qm[i].alliances.blue.teams[0]) + '</td>';
                      tout += '<td class="' + qm[i].alliances.blue.teams[1] + '">' + teamCode(qm[i].alliances.blue.teams[1]) + '</td>';
                      tout += '<td class="' + qm[i].alliances.blue.teams[2] + '">' + teamCode(qm[i].alliances.blue.teams[2]) + '</td>';
                      tout += '<td class="' + qm[i].alliances.red.teams[0] + redWin + ' ' + qm[i].alliances.red.teams[1] + redWin + ' ' + qm[i].alliances.red.teams[2] + redWin + ' ' + '">' + qm[i].alliances.red.score + '</td>';
                      tout += '<td class="' + qm[i].alliances.blue.teams[0] + blueWin + ' ' + qm[i].alliances.blue.teams[1] + blueWin + ' ' + qm[i].alliances.blue.teams[2] + blueWin + '">' + qm[i].alliances.blue.score + '</td>';

                      tout += '</tr>';
                    }
                    tout += '</table></div>';

                    tout += '<div id="card" class="eventData"><div class="header">Quarter Finals</div><table id="QuarterFinalMatchSchedule">';
                    tout += '<tr>';
                    tout += '<th>#</th>';
                    tout += '<th>Time</th>';
                    tout += '<th colspan="3">Red Alliance</th>';
                    tout += '<th colspan="3">Blue Alliance</th>';
                    tout += '<th>Red Score</th>';
                    tout += '<th>Blue Score</th>';
                    tout += '</tr>';
                    for (i = 0; i < qf.length; i++)
                    {
                      var rowID = qf[i].key;
                      var redWin, blueWin;
                      if (qf[i].alliances.red.score > qf[i].alliances.blue.score) {
                        redWin = "win";
                        blueWin = "loss";
                      } else if(qf[i].alliances.red.score < qf[i].alliances.blue.score) {
                        redWin = "loss";
                        blueWin = "win";
                      }
                      var teamClassString = qf[i].alliances.red.teams[0] + 'red ' + qf[i].alliances.red.teams[1] + 'red ' + qf[i].alliances.red.teams[2] + 'red ' + qf[i].alliances.blue.teams[0] + 'blue ' + qf[i].alliances.blue.teams[1] + 'blue ' + qf[i].alliances.blue.teams[2] + 'blue';
                      tout += '<tr id = "' + rowID + '" class="' + teamClassString + '">';
                      tout += '<td>' + qf[i].match_number + '</td>';
                      tout += '<td>' + cTime(qf[i].time) + '</td>';
                      tout += '<td class="' + qf[i].alliances.red.teams[0] + '">' + teamCode(qf[i].alliances.red.teams[0]) + '</td>';
                      tout += '<td class="' + qf[i].alliances.red.teams[1] + '">' + teamCode(qf[i].alliances.red.teams[1]) + '</td>';
                      tout += '<td class="' + qf[i].alliances.red.teams[2] + '">' + teamCode(qf[i].alliances.red.teams[2]) + '</td>';
                      tout += '<td class="' + qf[i].alliances.blue.teams[0] + '">' + teamCode(qf[i].alliances.blue.teams[0]) + '</td>';
                      tout += '<td class="' + qf[i].alliances.blue.teams[1] + '">' + teamCode(qf[i].alliances.blue.teams[1]) + '</td>';
                      tout += '<td class="' + qf[i].alliances.blue.teams[2] + '">' + teamCode(qf[i].alliances.blue.teams[2]) + '</td>';
                      tout += '<td class="' + qf[i].alliances.red.teams[0] + redWin + ' ' + qf[i].alliances.red.teams[1] + redWin + ' ' + qf[i].alliances.red.teams[2] + redWin + ' ' + '">' + qf[i].alliances.red.score + '</td>';
                      tout += '<td class="' + qf[i].alliances.blue.teams[0] + blueWin + ' ' + qf[i].alliances.blue.teams[1] + blueWin + ' ' + qf[i].alliances.blue.teams[2] + blueWin + '">' + qf[i].alliances.blue.score + '</td>';

                      tout += '</tr>';
                    }
                    tout += '</table></div>';

                    tout += '<div id="card" class="eventData"><div class="header">Semi Finals</div><table id="SemiFinalMatchSchedule">';
                    tout += '<tr>';
                     tout += '<th>#</th>';
                     tout += '<th>Time</th>';
                     tout += '<th colspan="3">Red Alliance</th>';
                     tout += '<th colspan="3">Blue Alliance</th>';
                     tout += '<th>Red Score</th>';
                     tout += '<th>Blue Score</th>';
                     tout += '</tr>';
                     for (i = 0; i < sf.length; i++)
                     {
                       var rowID = sf[i].key;
                       var redWin, blueWin;
                       if (sf[i].alliances.red.score > sf[i].alliances.blue.score) {
                         redWin = "win";
                         blueWin = "loss";
                       } else if(sf[i].alliances.red.score < sf[i].alliances.blue.score) {
                         redWin = "loss";
                         blueWin = "win";
                       }
                       var teamClassString = sf[i].alliances.red.teams[0] + 'red ' + sf[i].alliances.red.teams[1] + 'red ' + sf[i].alliances.red.teams[2] + 'red ' + sf[i].alliances.blue.teams[0] + 'blue ' + sf[i].alliances.blue.teams[1] + 'blue ' + sf[i].alliances.blue.teams[2] + 'blue';
                       tout += '<tr id = "' + rowID + '" class="' + teamClassString + '">';
                       tout += '<td>' + sf[i].match_number + '</td>';
                       tout += '<td>' + cTime(sf[i].time) + '</td>';
                       tout += '<td class="' + sf[i].alliances.red.teams[0] + '">' + teamCode(sf[i].alliances.red.teams[0]) + '</td>';
                       tout += '<td class="' + sf[i].alliances.red.teams[1] + '">' + teamCode(sf[i].alliances.red.teams[1]) + '</td>';
                       tout += '<td class="' + sf[i].alliances.red.teams[2] + '">' + teamCode(sf[i].alliances.red.teams[2]) + '</td>';
                       tout += '<td class="' + sf[i].alliances.blue.teams[0] + '">' + teamCode(sf[i].alliances.blue.teams[0]) + '</td>';
                       tout += '<td class="' + sf[i].alliances.blue.teams[1] + '">' + teamCode(sf[i].alliances.blue.teams[1]) + '</td>';
                       tout += '<td class="' + sf[i].alliances.blue.teams[2] + '">' + teamCode(sf[i].alliances.blue.teams[2]) + '</td>';
                       tout += '<td class="' + sf[i].alliances.red.teams[0] + redWin + ' ' + sf[i].alliances.red.teams[1] + redWin + ' ' + sf[i].alliances.red.teams[2] + redWin + ' ' + '">' + sf[i].alliances.red.score + '</td>';
                       tout += '<td class="' + sf[i].alliances.blue.teams[0] + blueWin + ' ' + sf[i].alliances.blue.teams[1] + blueWin + ' ' + sf[i].alliances.blue.teams[2] + blueWin + '">' + sf[i].alliances.blue.score + '</td>';

                       tout += '</tr>';
                     }
                     tout += '</table></div>';

                    tout += '<div id="card" class="eventData"><div class="header">Finals</div><table id="FinalMatchSchedule">';
                    tout += '<tr>';
                    tout += '<th>#</th>';
                    tout += '<th>Time</th>';
                    tout += '<th colspan="3">Red Alliance</th>';
                    tout += '<th colspan="3">Blue Alliance</th>';
                    tout += '<th>Red Score</th>';
                    tout += '<th>Blue Score</th>';
                    tout += '</tr>';
                    for (i = 0; i < f.length; i++)
                    {
                      var rowID = f[i].key;
                      var redWin, blueWin;
                      if (f[i].alliances.red.score > f[i].alliances.blue.score) {
                        redWin = "win";
                        blueWin = "loss";
                      } else if(f[i].alliances.red.score < f[i].alliances.blue.score) {
                        redWin = "loss";
                        blueWin = "win";
                      }
                      var teamClassString = f[i].alliances.red.teams[0] + 'red ' + f[i].alliances.red.teams[1] + 'red ' + f[i].alliances.red.teams[2] + 'red ' + f[i].alliances.blue.teams[0] + 'blue ' + f[i].alliances.blue.teams[1] + 'blue ' + f[i].alliances.blue.teams[2] + 'blue';
                      tout += '<tr id = "' + rowID + '" class="' + teamClassString + '">';
                      tout += '<td>' + f[i].match_number + '</td>';
                      tout += '<td>' + cTime(f[i].time) + '</td>';
					            tout += '<td class="' + f[i].alliances.red.teams[0] + '">' + teamCode(f[i].alliances.red.teams[0]) + '</td>';
                      tout += '<td class="' + f[i].alliances.red.teams[1] + '">' + teamCode(f[i].alliances.red.teams[1]) + '</td>';
                      tout += '<td class="' + f[i].alliances.red.teams[2] + '">' + teamCode(f[i].alliances.red.teams[2]) + '</td>';
                      tout += '<td class="' + f[i].alliances.blue.teams[0] + '">' + teamCode(f[i].alliances.blue.teams[0]) + '</td>';
                      tout += '<td class="' + f[i].alliances.blue.teams[1] + '">' + teamCode(f[i].alliances.blue.teams[1]) + '</td>';
                      tout += '<td class="' + f[i].alliances.blue.teams[2] + '">' + teamCode(f[i].alliances.blue.teams[2]) + '</td>';
                      tout += '<td class="' + f[i].alliances.red.teams[0] + redWin + ' ' + f[i].alliances.red.teams[1] + redWin + ' ' + f[i].alliances.red.teams[2] + redWin + ' ' + '">' + f[i].alliances.red.score + '</td>';
                      tout += '<td class="' + f[i].alliances.blue.teams[0] + blueWin + ' ' + f[i].alliances.blue.teams[1] + blueWin + ' ' + f[i].alliances.blue.teams[2] + blueWin + '">' + f[i].alliances.blue.score + '</td>';
                      tout += '</tr>';
                    }
                    tout += '</table></div>';

                    $("#teamDataTable").html(tout);
                    $("td." + teamKey).css({"font-weight":"bold"});
                    $("tr." + teamKey + "red").css({"background":"rgba(255,58,58,0.5)"});
                    $("tr." + teamKey + "blue").css({"background":"rgba(0,114,255,0.5)"});
                    $("#card.eventData").css({"display":"block"});

                    scores.render();
                  });
                }
              });
            });
          }
        });
      });
    }


    $(document).ready(function(){
      load();
    });
    </script>

    <title>Ethan Elliott | TBA</title>
  </head>
  <body>
    <header>
      <h1>Green Alliance</h1>
    </header>
    <main>
      <div id="card" class="eventSelect">
        <div id="eventSelectForm"></div>
      </div>
      <div id="card" class="teamSelect" style="display:none;">
        <div id="teamSelectForm"></div>
      </div>
      <div id="teamDataTable"></div>
      <div id="card" class="eventData">
        <div id="scoresChart"></div>
      </div>
    </main>
    <footer>
      <span>&copy; Ethan Elliott 2016</span>
    </footer>
  </body>
  </html>
