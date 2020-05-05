/*
Copyright (c) 2015, Brandon Jones.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

let SimulationShader = function (renderer, maxColliders, velRandomScaling) {
  let gl = renderer.getContext();
  if (!maxColliders) maxColliders = 8;

  const attributes = {
    position: 0,
    velocity: 1,
    origin: 2,
    randomSeed: 3,
  };

  function createProgram () {
    let vertexSrc = `#version 300 es
    precision ${renderer.capabilities.precision} float;

    in vec4 position;
    in vec4 velocity;
    in vec4 origin;
    in highp uint randomSeed;

    out vec4 outPosition;
    out vec4 outVelocity;
    flat out highp uint outRandomSeed;

    uniform float time;
    uniform float timeDelta;
    uniform vec4 colliderBases[${maxColliders}];
    uniform vec4 colliderTips[${maxColliders}];

    highp uint curRandomSeed;

    float rand(){
      // Use Microsoft's Visual C++ constants for the linear congruential generator
      curRandomSeed = (uint(214013) * curRandomSeed + uint(2531011));
      return float((curRandomSeed >> 16) & uint(0x7FFF)) / 32767.0;
    }

    void runSimulation(vec4 pos, vec4 vel, out vec4 outPos, out vec4 outVel) {
      int collided = 0;
      outPos.x = pos.x + vel.x;
      outPos.y = pos.y + vel.y;
      outPos.z = pos.z + vel.z;
      outPos.w = pos.w;
      outVel = vel;
      if (pos.w == 1.0) {
        outVel = vel * 0.95; // Cheap drag
        vec3 resetVec = normalize(origin.xyz - outPos.xyz) * 0.0005;
        outVel.xyz += resetVec;
      }

      // Interaction with fingertips
      for (int i = 0; i < ${maxColliders}; ++i) {
        vec4 base = colliderBases[i];
        vec4 tip = colliderTips[i];
        vec3 height = tip.xyz - base.xyz;
        vec3 relPos = pos.xyz - base.xyz;

        float h = length(height);
        vec3 up = normalize(height);

        float dot_ = dot(up, relPos);

        if (dot_ > 0.0  && dot_ < h) {
          vec3 cross_ = cross(up, relPos);
          float dist = length(cross_);
          float t = tip.w;
          float b = base.w;
          float boundary = ((t - b) * dot_ / h) + b;
          if (boundary > dist) {
            vec3 movement = normalize(cross(cross_, up)) * boundary;
            outPos += vec4(movement, 0.0);
            outPos.w = 1.0; // Indicates particles has been interacted with
            outVel += vec4(movement * 0.1, 0.0);
            collided = 1;
            break;
          }
          // add tangential velocity
          float forceFieldDist = boundary * 2.0 - dist;
          if (forceFieldDist > 0.0) {
            vec3 tangent = normalize(cross_);
            outVel.xyz += tangent * 0.0007;
          }
        }
      }

      if (collided == 0) {
        for (int i = 0; i < ${maxColliders}; ++i) {
         vec4 tip = colliderTips[i];
         vec3 posTip = pos.xyz - tip.xyz;
         float distTip = length(posTip);
         if (distTip < tip.w) {
           vec3 movement = normalize(posTip) * tip.w;
           outPos += vec4(movement, 0.0);
           outPos.w = 1.0; // Indicates particles has been interacted with
           outVel += vec4(movement * 0.1, 0.0);
           break;
         }
         // add tangential velocity
         float forceFieldDist = (tip.w * 2.0 - distTip);
         if (forceFieldDist > 0.0) {
           vec2 tangentToCollider = normalize(vec2(posTip.y, -posTip.x));
           outVel.xy += tangentToCollider * 0.0007;
         }
        }
      }

      // Interaction with walls
      if (outPos.x < -5.2) {
        outPos.x += (outPos.x + 5.2) * 2.0;
        outVel.x *= -1.0;
      }
      if (outPos.x > 5.2) {
        outPos.x += (outPos.x - 5.2) * 2.0;
        outVel.x *= -1.0;
      }
      if (outPos.y < -2.0) {
        outPos.y += (outPos.y + 2.0) * 2.0;
        outVel.y *= -1.0;
      }
      if (outPos.y > 2.0) {
        outPos.y += (outPos.y - 2.0) * 2.0;
        outVel.y *= -1.0;
      }
      if (outPos.z < -2.56) {
        outPos.z += (outPos.z + 2.56) * 2.0;
        outVel.z *= -1.0;
      }
      if (outPos.z > 2.56) {
        outPos.z += (outPos.z - 2.56) * 2.0;
        outVel.z *= -1.0;
      }
    }

    void main() {
      vec4 pos = position;
      curRandomSeed = randomSeed;

      // Randomly end the life of the particle and reset it to it's original position
      // Moved particles reset less frequently.
      float resetRate = (pos.w == 1.0) ? 0.998 : 0.97;
      if ( rand() > resetRate ) {
        outPosition = vec4(origin.xyz, 0.0);
        // This velocity reset should be in sync with the initialization values in index.html
        outVelocity = vec4((rand()-0.5) * ${velRandomScaling},
                           (rand()-0.5) * ${velRandomScaling},
                           (rand()-0.5) * ${velRandomScaling},
                           0.0);
      } else {
        runSimulation(position, velocity, outPosition, outVelocity);
      }

      outRandomSeed = curRandomSeed;
    }`;

    let fragmentSrc = `#version 300 es
    precision ${renderer.capabilities.precision} float;

    out vec4 fragColor;

    void main() {
      fragColor = vec4(1.0, 1.0, 1.0, 1.0);
    }`;

    let vertexShader = gl.createShader( gl.VERTEX_SHADER );
    gl.shaderSource( vertexShader, vertexSrc );
    gl.compileShader( vertexShader );
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      console.error("Shader failed to compile", gl.getShaderInfoLog( vertexShader ));
      return null;
    }

    let fragmentShader = gl.createShader( gl.FRAGMENT_SHADER );
    gl.shaderSource( fragmentShader, fragmentSrc );
    gl.compileShader( fragmentShader );
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error("Shader failed to compile", gl.getShaderInfoLog( fragmentShader ));
      return null;
    }

    let program = gl.createProgram();

    gl.attachShader( program, vertexShader );
    gl.attachShader( program, fragmentShader );

    gl.deleteShader( vertexShader );
    gl.deleteShader( fragmentShader );

    for (let i in attributes) {
      gl.bindAttribLocation( program, attributes[i], i );
    }

    gl.transformFeedbackVaryings( program, ["outPosition", "outVelocity", "outRandomSeed"], gl.SEPARATE_ATTRIBS );

    gl.linkProgram( program );

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Shader program failed to link", gl.getProgramInfoLog( program ));
      gl.deleteProgram(program);
      return null;
    }

    return program;
  };

  var program = createProgram();

  if (!program) {
    return null;
  }

  let uniforms = {};
  let count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    let uniform = gl.getActiveUniform(program, i);
    let name = uniform.name.replace("[0]", "");
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  let timeValue = 0;
  let timeDelta = 0;
  let collidersValue = null;

  return {
    program: program,

    attributes: attributes,

    bind: function() {
      gl.useProgram(program);
      gl.uniform1f(uniforms.time, timeValue);
      gl.uniform1f(uniforms.timeDelta, timeDelta);
      gl.uniform4fv(uniforms.colliderBases, collidersValue.bases);
      gl.uniform4fv(uniforms.colliderTips, collidersValue.tips);
    },

    setColliders: function ( colliders ) {
      collidersValue = colliders;
    },

    setTime: function ( time ) {
      if (timeValue != 0) {
        timeDelta = timeValue - time;
      }
      timeValue = time;
    },

    getTime: function ( time ) {
      return timeValue;
    }

  }

};

export { SimulationShader };
