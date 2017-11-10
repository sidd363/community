var userid = getParameterByName("userid");
var relation = getParameterByName("relation");
(function(d3, ajax) {
  window._ajax.get(location.origin + "/api/personality/" + userid + "/relation/" + relation, null, function(data) {
    var dataset1 = [{
      count: 1,
      color: '#FFECB3',
      value: 0,
      valColor: ["#FFE082", "#FFD54F", "#FFC107", "#FFA000", "#FF6F00"],
      "name": "fun"
    }, {
      count: 1,
      color: '#FFECB3',
      value: 0,
      valColor: ["#FFE082", "#FFD54F", "#FFC107", "#FFA000", "#FF6F00"],
      "name": "stylish"
    }, {
      count: 1,
      color: '#FFECB3',
      value: 0,
      valColor: ["#FFE082", "#FFD54F", "#FFC107", "#FFA000", "#FF6F00"],
      "name": "clear"
    }, {
      count: 1,
      color: '#FFECB3',
      value: 0,
      valColor: ["#FFE082", "#FFD54F", "#FFC107", "#FFA000", "#FF6F00"],
      "name": "direct"
    }, {
      count: 1,
      color: '#BBDEFB',
      value: 0,
      valColor: ["#90CAF9", "#64B5F6", "#2196F3", "#1976D2", "#0D47A1"],
      "name": "imaginative"
    }, {
      count: 1,
      color: '#BBDEFB',
      value: 0,
      valColor: ["#90CAF9", "#64B5F6", "#2196F3", "#1976D2", "#0D47A1"],
      "name": "big picture"
    }, {
      count: 1,
      color: '#BBDEFB',
      value: 0,
      valColor: ["#90CAF9", "#64B5F6", "#2196F3", "#1976D2", "#0D47A1"],
      "name": "intuitive"
    }, {
      count: 1,
      color: '#BBDEFB',
      value: 0,
      valColor: ["#90CAF9", "#64B5F6", "#2196F3", "#1976D2", "#0D47A1"],
      "name": "systematic"
    }, {
      count: 1,
      color: '#FFCDD2',
      value: 0,
      valColor: ["#EF9A9A", "#E57373", "#F44336", "#D32F2F", "#B71C1C"],
      "name": "aggressive"
    }, {
      count: 1,
      color: '#FFCDD2',
      value: 0,
      valColor: ["#EF9A9A", "#E57373", "#F44336", "#D32F2F", "#B71C1C"],
      "name": "persistent"
    }, {
      count: 1,
      color: '#B2DFDB',
      value: 0,
      valColor: ["#80CBC4", "#4DB6AC", "#009688", "#00796B", "#004D40"],
      "name": "certain"
    }, {
      count: 1,
      color: '#B2DFDB',
      value: 0,
      valColor: ["#80CBC4", "#4DB6AC", "#009688", "#00796B", "#004D40"],
      "name": "positive"
    }];

    var dataset2 = [{
      count: 1,
      color: '#FFECB3',
      value: 0,
      valColor: ["#FFE082", "#FFD54F", "#FFC107", "#FFA000", "#FF6F00"],
      "name": "serious"
    }, {
      count: 1,
      color: '#FFECB3',
      value: 0,
      valColor: ["#FFE082", "#FFD54F", "#FFC107", "#FFA000", "#FF6F00"],
      "name": "dull"
    }, {
      count: 1,
      color: '#FFECB3',
      value: 0,
      valColor: ["#FFE082", "#FFD54F", "#FFC107", "#FFA000", "#FF6F00"],
      "name": "vague"
    }, {
      count: 1,
      color: '#FFECB3',
      value: 0,
      valColor: ["#FFE082", "#FFD54F", "#FFC107", "#FFA000", "#FF6F00"],
      "name": "diplomatic"
    }, {
      count: 1,
      color: '#BBDEFB',
      value: 0,
      valColor: ["#90CAF9", "#64B5F6", "#2196F3", "#1976D2", "#0D47A1"],
      "name": "realistic"
    }, {
      count: 1,
      color: '#BBDEFB',
      value: 0,
      valColor: ["#90CAF9", "#64B5F6", "#2196F3", "#1976D2", "#0D47A1"],
      "name": "detailed"
    }, {
      count: 1,
      color: '#BBDEFB',
      value: 0,
      valColor: ["#90CAF9", "#64B5F6", "#2196F3", "#1976D2", "#0D47A1"],
      "name": "analytical"
    }, {
      count: 1,
      color: '#BBDEFB',
      value: 0,
      valColor: ["#90CAF9", "#64B5F6", "#2196F3", "#1976D2", "#0D47A1"],
      "name": "hapahazrd"
    }, {
      count: 1,
      color: '#FFCDD2',
      value: 0,
      valColor: ["#EF9A9A", "#E57373", "#F44336", "#D32F2F", "#B71C1C"],
      "name": "calm"
    }, {
      count: 1,
      color: '#FFCDD2',
      value: 0,
      valColor: ["#EF9A9A", "#E57373", "#F44336", "#D32F2F", "#B71C1C"],
      "name": "laid back"
    }, {
      count: 1,
      color: '#B2DFDB',
      value: 0,
      valColor: ["#80CBC4", "#4DB6AC", "#009688", "#00796B", "#004D40"],
      "name": "flexible"
    }, {
      count: 1,
      color: '#B2DFDB',
      value: 0,
      valColor: ["#80CBC4", "#4DB6AC", "#009688", "#00796B", "#004D40"],
      "name": "sceptic"
    }];

    var dataset3 = [{
      count: 4,
      color: '#fff1ce',
      "name": "Convey"
    }, {
      count: 4,
      color: '#ddeaf5',
      "name": "Think"
    }, {
      count: 2,
      color: '#fedddd',
      "name": "Act"
    }, {
      count: 2,
      color: '#e1efd9',
      "name": "Decide"
    }]
    var dataset4 = [{
      count: 1,
      color: '#cbcbcb',
      "name": "ambitious"
    }, {
      count: 1,
      color: '#cbcbcb',
      "name": "individual"
    }]
    var personality = JSON.parse(data);
    var personalityChart = personality.personalityChart;
    if (personalityChart) {
      for (var index in dataset1) {
        var data1 = dataset1[index];
        var data2 = dataset2[index];
        var value1 = personalityChart[data1.name];
        var value2 = personalityChart[data2.name];
        dataset1[index]["value"] = value1 || 0;
        dataset2[index]["value"] = value2 || 0;
      }
      for (var index in dataset4) {
        var value = personalityChart[dataset4[index].name]
        dataset4[index]["value"] = value
      }
      var width = 1000;
      var height = 1000;
      var donutWidth = 100;
      var outerWidth = 50
      var radius = Math.min(width, height) / 2
      var radius1 = radius - outerWidth;
      var radius2 = radius1 - donutWidth;
      var radius3 = (radius2 - donutWidth) * .6;

      var svg = d3.select('#chart')
        .append('svg')
        .attr("id", "svgMain")
        .attr('width', width)
        .style("margin", "0px auto")
        .style("display", "block")
        .attr('height', height);
      var svgTranslationAttrs = {
        "transform": "translate(" + (width / 2) + "," + (height / 2) + ") rotate(45 0 0)"
      }
      var svg1 = svg.append('g')
        .attr(svgTranslationAttrs);
      var svg2 = svg.append('g')
        .attr(svgTranslationAttrs);
      var svg3 = svg.append('g')
        .attr(svgTranslationAttrs);
      var svg4 = svg.append('g')
        .attr(svgTranslationAttrs)

      svg4.append("circle")
        .attr("r", (radius2 - donutWidth))
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("transform", "rotate(-45)")
        .attr("fill", "#f5f5f5")

      var defs = svg1.append('svg:defs');

      var allpatterns = defs.selectAll("pattern")
        .data(dataset1)
        .enter().append('svg:pattern')
        .attr('id', function(d, i) {
          return "pattern-" + i;
        })
        .attr('width', 7)
        .attr('height', 7)
        .attr('patternUnits', 'userSpaceOnUse');

      allpatterns
        .append('svg:rect')
        .attr('width', 7)
        .attr('height', 7)
        .attr('fill', function(d, i) {
          return d.color;
        });
      allpatterns
        .append('svg:image')
        .attr('width', 7)
        .attr('height', 7)
        .attr('xlink:href', 'https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/repeating-right.png');

      var avatardefs = svg4.append('svg:defs');
      if (personality.image_url) {
        avatardefs.append("svg:pattern")
          .attr("id", "grump_avatar")
          .attr("width", "100%")
          .attr("height", "100%")
          .append("svg:image")
          .attr("xlink:href", personality.image_url)
          .attr("width", (radius2 - donutWidth) * .6 * 2)
          .attr("height", (radius2 - donutWidth) * .6 * 2)
        var circle = svg4.append("circle")
          .attr("r", (radius2 - donutWidth) * .6)
          .attr("cx", 0)
          .attr("cy", 0)
          .attr("transform", "rotate(-45)")
          .attr("fill", "url(#grump_avatar)")
      } else {
        var circle = svg4.append("circle")
          .attr("r", (radius2 - donutWidth) * .6)
          .attr("cx", 0)
          .attr("cy", 0)
          .attr("transform", "rotate(-45)")
          .attr("fill", "#f5f5f5")
        svg4.append("text")
          .attr("dx", 0 - 50)
          .attr("dy", 0 + 35)
          .style("font-size", "90px")
          .attr("transform", "rotate(-45)")
          .text(function(d) {
            var initials = "";
            if (personality.firstName) {
              initials = personality.firstName.charAt(0).toUpperCase();
            }
            if (personality.lastName) {
              initials += personality.lastName.charAt(0).toUpperCase();
            }
            return initials;
          })
      }

      var arc1 = d3.svg.arc()
        .innerRadius(radius1 - donutWidth)
        .outerRadius(radius1);
      var arc2 = d3.svg.arc()
        .innerRadius(radius2 - donutWidth)
        .outerRadius(radius2);
      var arc3 = d3.svg.arc()
        .innerRadius(radius1)
        .outerRadius(radius1 + outerWidth);

      var arc4 = d3.svg.arc()
        .innerRadius(radius3)
        .outerRadius(radius2 - donutWidth)
        .startAngle(function(d, i) {
          var multiplyFactor = 1;
          switch (Math.ceil(d.data.value)) {
            case 1:
              multiplyFactor = .42
              break;
            case 2:
              multiplyFactor = .68
              break;
            case 3:
              multiplyFactor = .84
              break;
            case 4:
              multiplyFactor = .94
              break;
            case 5:
              multiplyFactor = 1
              break;
          }
          var arcAngle = Math.PI * multiplyFactor;
          var emptyAngle = Math.PI - arcAngle;
          var startAngle = emptyAngle / 2;
          if (i == 1)
            return -startAngle
          else
            return startAngle
        })
        .endAngle(function(d, i) {
          var multiplyFactor = 1;
          switch (Math.ceil(d.data.value)) {
            case 1:
              multiplyFactor = .42
              break;
            case 2:
              multiplyFactor = .68
              break;
            case 3:
              multiplyFactor = .84
              break;
            case 4:
              multiplyFactor = .94
              break;
            case 5:
              multiplyFactor = 1
              break;
          }

          var arcAngle = Math.PI * multiplyFactor;
          var emptyAngle = Math.PI - arcAngle;
          var startAngle = emptyAngle / 2;
          var endAngle = startAngle + arcAngle;
          if (i == 0)
            return endAngle
          else
            return -endAngle
        })

      var pie = d3.layout.pie()
        .value(function(d) {
          return d.count;
        }).sort(null);

      var path0 = svg4.selectAll('path')
        .data(pie(dataset4))
        .enter()
        .append('path')
        .attr('d', arc4)
        .attr("id", function(d, i) {
          return Math.random() + i;
        })
        .attr('stroke-width', 2)
        .attr("transform", "rotate(60)")
        .attr('stroke', "#000")
        .attr('fill', function(d, i) {
          return d.data.color;
        })
        .each(function(d, i) {
          svg4
            .append("text")
            .attr("class", "dimension")
            .attr("x", 0) //Move the text from the start angle of the arc
            .attr("dy", 40) //Move the text down
            .attr("font-family", "Arial")
            .attr("fill", "white")
            .attr("letter-spacing", "8")
            .attr("font-size", "15px")
            .attr("font-weight", "bold")
            .attr("text-anchor", "middle")
            .append("textPath")
            .attr('startOffset', '25%')
            .attr("xlink:href", "#" + this.id)
            .text(d.data.name.toUpperCase())
        })

      var path1 = svg1.selectAll('path')
        .data(pie(dataset1))
        .enter()
        .append('path')
        .attr('d', arc1)
        .attr("id", function(d, i) {
          return Math.random() + i;
        })
        .attr('stroke-width', 3)
        .attr('stroke', "white")
        .attr('fill', function(d, i) {
          return "url(#pattern-" + i + ")";
        })
        .each(function(d, i) {
          var name = d.data.name;
          var fontColor = d.data.value ? "white" : "#CCC";
          var innerRadius = radius2;
          var endIndex = d.data.value;
          var fractionalPart = d.data.value - Math.floor(d.data.value);
          if (fractionalPart)
            endIndex = Math.ceil(d.data.value)
          for (var i = 1; i <= endIndex; i++) {
            (function(i) {
              var multiplyFactor = 1;
              if (i == 1) {
                multiplyFactor = .42;
              } else if (i == 2) {
                multiplyFactor = .26;
              } else if (i == 3) {
                multiplyFactor = .16;
              } else if (i == 4) {
                multiplyFactor = .1;
              } else if (i == 5) {
                multiplyFactor = .06;
              }
              if (fractionalPart && i == endIndex)
                multiplyFactor = multiplyFactor * fractionalPart;
              var outerRadius = innerRadius + multiplyFactor * donutWidth;
              if (outerRadius == radius1) {
                outerRadius = outerRadius - 2;
              }
              console.log("outerRadius===", outerRadius);
              var newArc = d3.svg.arc()
                .innerRadius(innerRadius)
                .outerRadius(outerRadius)
                .startAngle(d.startAngle)
                .endAngle(d.endAngle);
              svg1
                .append("path")
                .attr("d", newArc)
                .attr("fill", d.data.valColor[i - 1]);
              innerRadius = outerRadius;
            })(i)
          }
          var groupArc = d3.svg.arc()
            .innerRadius(radius2)
            .outerRadius(innerRadius)
            .startAngle(d.startAngle)
            .endAngle(d.endAngle);
          svg1
            .append("path")
            .attr("d", groupArc)
            .attr("stroke-width", 2)
            .attr("stroke", "black")
            .attr("fill", "none");
          svg1
            .append("text")
            .attr("class", "dimension")
            .attr("x", 0) //Move the text from the start angle of the arc
            .attr("dy", 75) //Move the text down
            .attr("font-family", "Arial")
            .attr("fill", fontColor)
            .attr("letter-spacing", "4")
            .attr("font-size", "15px")
            .attr("font-weight", "bold")
            .attr("text-anchor", "middle")
            .append("textPath")
            .attr('startOffset', '18%')
            .attr("xlink:href", "#" + this.id)
            .text(name.toUpperCase())
        })
      var path2 = svg2.selectAll('path')
        .data(pie(dataset2))
        .enter()
        .append('path')
        .attr("class", "path2")
        .attr('id', function(d, i) {
          return Math.random() + i;
        })
        .attr('d', arc2)
        .attr('stroke-width', function(d, i) {
          var strokeval = 3;
          if (!d.data.value)
            strokeval = 0
          return strokeval;
        })
        .attr('stroke', "white")
        .attr('fill', function(d, i) {
          return "url(#pattern-" + i + ")";
        })
        .each(function(d, i) {
          var name = d.data.value ? d.data.name : "";
          var outerRadius = radius2;
          var fontColor = d.data.value ? "white" : "#CCC";
          var endIndex = d.data.value;
          var fractionalPart = d.data.value - Math.floor(d.data.value);
          if (fractionalPart)
            endIndex = Math.ceil(d.data.value)
          for (var i = 1; i <= endIndex; i++) {
            var multiplyFactor = 1;
            if (i == 1) {
              multiplyFactor = .42;
            } else if (i == 2) {
              multiplyFactor = .26;
            } else if (i == 3) {
              multiplyFactor = .16;
            } else if (i == 4) {
              multiplyFactor = .1;
            } else if (i == 5) {
              multiplyFactor = .06;
            }
            if (fractionalPart && i == endIndex)
              multiplyFactor = multiplyFactor * fractionalPart;
            var innerRadius = outerRadius - multiplyFactor * donutWidth;
            var newArc = d3.svg.arc()
              .innerRadius(innerRadius)
              .outerRadius(outerRadius)
              .startAngle(d.startAngle)
              .endAngle(d.endAngle);
            svg2
              .append("path")
              .attr("d", newArc)
              .attr("fill", d.data.valColor[i - 1])
            outerRadius = innerRadius;
          }
          var groupArc = d3.svg.arc()
            .innerRadius(outerRadius)
            .outerRadius(radius2)
            .startAngle(d.startAngle)
            .endAngle(d.endAngle);
          svg2
            .append("path")
            .attr("d", groupArc)
            .attr("stroke-width", 2)
            .attr("stroke", "black")
            .attr("fill", "none");

          svg2
            .append("text")
            .attr("class", "dimension")
            .attr("x", 0) //Move the text from the start angle of the arc
            .attr("dy", 35) //Move the text down
            .attr("font-family", "Arial")
            .attr("fill", fontColor)
            .attr("letter-spacing", "2")
            .attr("font-size", "14px")
            .attr("font-weight", "bold")
            .attr('text-anchor', 'middle')
            .append("textPath")
            .attr('startOffset', '16%')
            .attr("xlink:href", "#" + this.id)
            .text(name.toUpperCase())
        })
      var circle = svg2.append("circle")
        .attr({
          "cx": 0,
          "cy": 0,
          "r": radius2,
          "fill": "none",
          "stroke": "#fff",
          "stroke-dasharray": "10 5",
          "stroke-width": 3
        });
      var path3 = svg3.selectAll('path')
        .data(pie(dataset3))
        .enter()
        .append('path')
        .attr('d', arc3)
        .attr("id", function(d, i) {
          return Math.random() + i;
        })
        .attr('stroke-width', 2)
        .attr('stroke', "white")
        .attr('fill', "white")
        .each(function(d, i) {
          svg3
            .append("text")
            .attr("class", "dimension")
            .attr("x", 0) //Move the text from the start angle of the arc
            .attr("dy", 40) //Move the text down
            .attr("font-family", "Arial")
            .attr("letter-spacing", "60")
            .attr("font-size", "24px")
            .attr("fill", "#ccc")
            .attr("font-weight", "bold")
            .attr('text-anchor', 'middle')
            .append("textPath")
            .attr('startOffset', '25%')
            .attr("xlink:href", "#" + this.id)
            .text(d.data.name.toUpperCase())
        })
    }
    else{
      document.getElementById("chart").innerHTML +="<img src='/images/emptyvibe.png' style='margin:0 auto;display:block;' />"
    }
  });
})(window.d3, window._ajax);

function getParameterByName(name, url) {
  if (!url) url = window.location.href;
  name = name.replace(/[\[\]]/g, "\\$&");
  var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
    results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, " "));
}
