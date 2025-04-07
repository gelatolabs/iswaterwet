precision highp float;

uniform float u_time;
uniform vec2 u_resolution;

const vec3 WATER_SURFACE = vec3(0.15, 0.5, 0.75);
const vec3 DEEP_WATER = vec3(0.03, 0.08, 0.25);
const vec3 SUNLIGHT = vec3(0.85, 0.9, 0.95);

float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 1.0;
    float freq = 1.0;

    for(int i = 0; i < 6; i++) {
        sum += amp * noise(p * freq);
        amp *= 0.5;
        freq *= 2.0;
        p = vec2(p.y - p.x, p.x + p.y) * 1.1;
    }

    return sum;
}

float sunbeams(vec2 uv, float time) {
    vec2 sunPos = vec2(0.2, 1.2);

    float rotation = time * 0.1;
    float cosA = cos(rotation);
    float sinA = sin(rotation);
    vec2 dir = uv - sunPos;
    vec2 rotated = vec2(
        cosA * dir.x - sinA * dir.y,
        sinA * dir.x + cosA * dir.y
    );
    vec2 toSun = rotated;

    float angle = atan(toSun.y, toSun.x);
    float beams = 0.0;

    beams += 1.2 * sin(angle * 10.0 + time * 0.1);
    beams += 0.9 * sin(angle * 14.0 - time * 0.05);
    beams += 0.6 * sin(angle * 20.0 + time * 0.2);
    beams = (beams + 1.0) * 0.5;
    beams = pow(beams, 1.7);

    float dist = length(toSun);
    float falloff = smoothstep(1.3, 0.1, dist);
    float densityVariation = fbm(uv * 3.0 + time * 0.05);

    return beams * falloff * (0.5 + 0.3 * densityVariation) * 0.7;
}

float volumetricRays(vec2 uv, float time) {
    vec2 sunPos = vec2(0.5, 1.2);
    sunPos.x += 0.1 * sin(time * 0.1);
    vec2 dir = normalize(sunPos - uv);

    float intensity = 0.0;
    float decay = 0.96;
    float exposure = 0.15;
    float strength = 0.08;
    vec2 samplePos = uv;

    for (int i = 0; i < 16; i++) {
        samplePos += dir * 0.03;
        float sample = fbm(samplePos * 2.0 + time * 0.05);
        intensity += strength * sample;
        strength *= decay;
    }

    intensity = clamp(intensity * exposure, 0.0, 0.8);

    return intensity;
}

float caustics(vec2 uv, float time) {
    vec2 p = uv;
    p += vec2(fbm(uv * 3.0 - time * 0.1), fbm(uv * 2.0 + time * 0.15)) * 0.1;

    float pattern = fbm(p * 8.0 + time * 0.2);
    pattern = pow(pattern, 1.7) * 1.5;

    return pattern;
}

float waterDensity(vec2 uv, float time) {
    float layer1 = fbm(uv * 2.5 + vec2(time * 0.03, time * 0.01));
    float layer2 = fbm(uv * 3.7 - vec2(time * 0.02, time * 0.04));
    float layer3 = fbm(uv * 5.3 + vec2(time * 0.01, -time * 0.02));

    return (layer1 * 0.5 + layer2 * 0.3 + layer3 * 0.2);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;

    float targetAspect = 2.0;
    float currentAspect = u_resolution.x / u_resolution.y;

    if (currentAspect > targetAspect) {
        float scale = targetAspect / currentAspect;
        uv.x = (uv.x - 0.5) * scale + 0.5;
    } else {
        float scale = currentAspect / targetAspect;
        uv.y = (uv.y - 0.5) * scale + 0.5;
    }

    float depth = smoothstep(0.0, 1.5, 1.0 - uv.y);
    vec3 waterColor = mix(WATER_SURFACE, DEEP_WATER, depth);

    float density = waterDensity(uv, u_time);
    waterColor = mix(waterColor, waterColor * 0.7, density * 0.3);

    float beamRays = sunbeams(uv, u_time);
    float volumeRays = volumetricRays(uv, u_time);
    float combinedRays = max(beamRays, volumeRays * 0.6) * 0.7;
    float causticsEffect = caustics(uv, u_time) * (1.0 - depth * 0.7) * 0.7;
    float scatter = fbm(uv * 5.0 + u_time * 0.1) * 0.1 * (1.0 - depth);

    vec2 distortedUV = uv + vec2(
        sin(uv.y * 20.0 + u_time * 0.2) * 0.01,
        sin(uv.x * 15.0 - u_time * 0.1) * 0.01
    );

    float waterPattern = fbm(distortedUV * 4.0 + u_time * 0.05);

    vec3 finalColor = waterColor;
    finalColor += SUNLIGHT * combinedRays * (1.0 - depth * 0.5) * 0.7;
    finalColor += causticsEffect * SUNLIGHT * 0.15;
    finalColor += scatter * SUNLIGHT * 0.8;
    finalColor = mix(finalColor, finalColor * (0.75 + 0.25 * waterPattern), 0.3);
    finalColor = mix(finalColor, pow(finalColor, vec3(1.05)), 0.25);
    finalColor *= 0.95;
    finalColor = mix(finalColor, vec3(dot(finalColor, vec3(0.299, 0.587, 0.114))), -0.15);

    gl_FragColor = vec4(finalColor, 1.0);
}
