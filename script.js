var c;

var PointInSpace = function() {
	this.x = random(0, width);
	this.y = random(0, height);
	this.vx = random(-1.5,1.5);
	this.vy = random(-1.5,1.5);
	this.ax = 0;
	this.ay = 0;
	this.update = function() {
		this.x += this.vx;
		this.y += this.vy;
		if (this.x < 0) {
			this.x = width;
		} else if (this.x > width) {
			this.x = 0;
		}
		if (this.y < 0) {
			this.y = height;
		} else if (this.y > height) {
			this.y = 0;
		}
	}
	this.show = function() {
		ellipse(this.x, this.y, 3, 3);
	}
};

function distance(p1, p2) {
	var	minDist = 80;
	var dist;
	var	dx = p1.x - p2.x;
	var	dy = p1.y - p2.y;

	dist = Math.sqrt(dx*dx + dy*dy);

	if(dist <= minDist) {
		var ax = dx/100000;
    	var ay = dy/100000;
		p1.vx -= ax;
		p1.vy -= ay;
		p2.vx += ax;
		p2.vy += ay;
	}
}

var points = [];
var numOfPoints = 200;

function setup() {
	c = createCanvas(windowWidth, windowHeight);
	c.parent('sketch-wrapper');
	for (var i = 0; i < numOfPoints; i++) {
		points[i] = new PointInSpace();
	}
}

function draw()
{
	frameRate(60);
	background(0,0,0);
	for (var i = 0; i < points.length; i++) {
		points[i].update();
		points[i].show();
		for (var j = i + 1; j < points.length; j++) {
			distance(points[i], points[j]);
		}
	}
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}


$(window).scroll(function() {
    if(($(this).scrollTop()) > $("#front-wrapper").height()/2) {
        $('.right-side-menu').fadeIn();
    } else {
        $('.right-side-menu').fadeOut();
    }

	var halfPageHeight = $("#front-wrapper").height() / 2;
	if($(this).scrollTop() > $("#resume").offset().top - halfPageHeight && $(this).scrollTop() < ($("#resume").offset().top + $(".resume").height())) {
		$(".item-top").css({"background":"rgba(0,0,0,0)"});
		$(".item-about").css({"background":"rgba(0,0,0,0)"});
		$(".item-skills").css({"background":"rgba(0,0,0,0)"});
		$(".item-projects").css({"background":"rgba(0,0,0,0)"});
		$(".item-resume").css({"background":"rgba(0,0,0,1)"});
	} else if($(this).scrollTop() > $("#projects").offset().top - halfPageHeight && $(this).scrollTop() < ($("#projects").offset().top + $(".projects").height())) {
		$(".item-top").css({"background":"rgba(0,0,0,0)"});
		$(".item-about").css({"background":"rgba(0,0,0,0)"});
		$(".item-skills").css({"background":"rgba(0,0,0,0)"});
		$(".item-projects").css({"background":"rgba(0,0,0,1)"});
		$(".item-resume").css({"background":"rgba(0,0,0,0)"});
	} else if($(this).scrollTop() > $("#skills").offset().top - halfPageHeight && $(this).scrollTop() < ($("#skills").offset().top + $(".skills").height())) {
		$(".item-top").css({"background":"rgba(0,0,0,0)"});
		$(".item-about").css({"background":"rgba(0,0,0,0)"});
		$(".item-skills").css({"background":"rgba(0,0,0,1)"});
		$(".item-projects").css({"background":"rgba(0,0,0,0)"});
		$(".item-resume").css({"background":"rgba(0,0,0,0)"});
	} else if($(this).scrollTop() > $("#about").offset().top - halfPageHeight && $(this).scrollTop() < ($("#about").offset().top + $(".about").height())) {
		$(".item-top").css({"background":"rgba(0,0,0,0)"});
		$(".item-about").css({"background":"rgba(0,0,0,1)"});
		$(".item-skills").css({"background":"rgba(0,0,0,0)"});
		$(".item-projects").css({"background":"rgba(0,0,0,0)"});
		$(".item-resume").css({"background":"rgba(0,0,0,0)"});
	} else if ($(this).scrollTop() > $("#front-wrapper").offset().top - halfPageHeight && $(this).scrollTop() < ($("#front-wrapper").offset().top + $("#front-wrapper").height())) {
		$(".item-top").css({"background":"rgba(0,0,0,1)"});
		$(".item-about").css({"background":"rgba(0,0,0,0)"});
		$(".item-skills").css({"background":"rgba(0,0,0,0)"});
		$(".item-projects").css({"background":"rgba(0,0,0,0)"});
		$(".item-resume").css({"background":"rgba(0,0,0,0)"});
	}
 });

 var projects = [
	 {
		 name: "The Green Alliance",
		 image: "this.jpg",
		 description:"",
		 //url: "http://tga.ethanelliott.ca",
		 codeUrl: "http://github.com/ethanelliott/tga",
		 languages: ["NodeJS", "ExpressJs", "MongoDB", "Javascript", "JQuery", "Jade", "HTML", "CSS"],
		 tags: ["tagWord", "project"]
	 },
	 {
		 name: "Name of Project",
		 image: "this.jpg",
		 description:"Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
		 url: "http://google.ca",
		 codeUrl: "http://github.com/ethanelliott",
		 languages: ["Javascript", "HTML", "CSS"],
		 tags: ["tagWord", "project"]
	 },
	 {
		 name: "Name of Project",
		 image: "this.jpg",
		 description:"Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
		 url: "http://google.ca",
		 codeUrl: "http://github.com/ethanelliott",
		 languages: ["Javascript", "HTML", "CSS"],
		 tags: ["tagWord", "project"]
	 },
	 {
		 name: "Name of Project",
		 image: "this.jpg",
		 description:"Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
		 url: "http://google.ca",
		 codeUrl: "http://github.com/ethanelliott",
		 languages: ["Javascript", "HTML", "CSS"],
		 tags: ["tagWord", "project"]
	 }
 ];

  function searchProjects() {
 	var search = $(".project-search").val().toUpperCase();
	var refinedSearchArray = [];
	var test = false;
 	for (var i = 0; i < projects.length; i++) {
		test = false;
		for (var j = 0; j < projects[i].languages.length; j++) {
			if (projects[i].languages[j].toUpperCase().indexOf(search) > -1) {
				test = true;
				break;
			}
		}
		for (var k = 0; k < projects[i].tags.length; k++) {
			if (projects[i].tags[k].toUpperCase().indexOf(search) > -1) {
				test = true;
				break;
			}
		}
		if (projects[i].name.toUpperCase().indexOf(search) > -1 || projects[i].description.toUpperCase().indexOf(search) > -1 || projects[i].name.toUpperCase().indexOf(search) > -1) {
			test = true;
		}

		if (test) {
			refinedSearchArray.push(projects[i]);
		}
	}
	if (refinedSearchArray.length > 0) {
		loadProjects(refinedSearchArray);
	} else {
		$("#project-card-wrapper").html("No projects match search terms");
	}
  }

 function loadProjects(projectArray) {
	 var output = "";
	 for (var i = 0; i < projectArray.length; i++)
	 {
		 output += '<div id="project-card">';
		 output += '<div id="project-card-image"><img src="' + projectArray[i].image + '" /></div>';
		 output += '<div id="project-card-title">' + projectArray[i].name + '</div>';
		 output += '<div id="project-card-description">' + projectArray[i].description + '</div>';
		 output += '<div class="chip-container">'
		 for (var j = 0; j < projectArray[i].languages.length; j++)
		 {
			 output += '<div class="chip">' + projectArray[i].languages[j].toUpperCase() + '</div>';
		 }
		 output += '</div>';
		 output += '<div id="project-card-url-container">';
		 if (projectArray[i].codeUrl) {
			output += '<a href="' + projectArray[i].codeUrl + '" target="_blank"><div>View the code</div></a>';
		 }
		 if (projects[i].url) {
			output += '<a href="' + projectArray[i].url + '" target="_blank"><div>View the project</div></a>';
		 }
		 output += '</div>';
		 output += '</div>';
	 }
	 //$("#project-card-wrapper").html(output);
 }

 $(window).load(function(){
	 loadProjects(projects);
	 $('.right-side-menu').fadeOut(0);
 });
