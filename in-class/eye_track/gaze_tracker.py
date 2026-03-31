import cv2
import mediapipe as mp
import numpy as np
import json
from collections import deque
BaseOptions = mp.tasks.BaseOptions
FaceLandmarker = mp.tasks.vision.FaceLandmarker
FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

model_path = 'face_landmarker.task' 

options = FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=model_path),
    running_mode=VisionRunningMode.VIDEO
)

# Screen Resolution
SCREEN_W, SCREEN_H = 1920, 1080

# Load Calibration Data
try:
    with open("gaze_calibration.json", "r") as f:
        data = json.load(f)
except FileNotFoundError:
    print("Error: gaze_calibration.json not found. Run the calibration script first!")
    exit()

# Extract vectors and screen targets
gaze_vecs = np.array([d["gaze_vec"] for d in data])
screen_vecs = np.array([d["screen_pt"] for d in data])

# TODO
# initialize regression models

# TODO
# initialize Kalman filter

def get_eye_vector(landmarks):
    """Calculates the relative position of the iris center within eye corners."""
    # Left Eye indices
    l_iris = np.array([landmarks[468].x, landmarks[468].y])
    l_inner = np.array([landmarks[133].x, landmarks[133].y])
    l_outer = np.array([landmarks[33].x, landmarks[33].y])
    
    # Right Eye indices
    r_iris = np.array([landmarks[473].x, landmarks[473].y])
    r_inner = np.array([landmarks[362].x, landmarks[362].y])
    r_outer = np.array([landmarks[263].x, landmarks[263].y])

    # Relative offset: Iris position relative to the center of the eye socket
    l_vec = l_iris - (l_inner + l_outer) / 2
    r_vec = r_iris - (r_inner + r_outer) / 2
    
    return (l_vec + r_vec) / 2

cap = cv2.VideoCapture(0)
cv2.namedWindow("Gaze Tracker", cv2.WND_PROP_FULLSCREEN)
cv2.setWindowProperty("Gaze Tracker", cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)

with FaceLandmarker.create_from_options(options) as landmarker:
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        frame = cv2.flip(frame, 1) # Mirror for natural interaction
        
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        result = landmarker.detect_for_video(mp_image, int(cap.get(cv2.CAP_PROP_POS_MSEC)))
        
        screen_canvas = np.zeros((SCREEN_H, SCREEN_W, 3), dtype=np.uint8)

        if result.face_landmarks:
            vec = get_eye_vector(result.face_landmarks[0])

            # TODO
            # map eye vector to screen coordinates using regression models
            # final_x = ?
            # final_y = ?

            # TODO
            # map predicted coordinates through Kalman filter for smoothing
            # final_x = ?
            # final_y = ?
         
            # Clamp values to screen boundaries
            final_x = np.clip(final_x, 0, SCREEN_W)
            final_y = np.clip(final_y, 0, SCREEN_H)

            # Draw the gaze "cursor"
            cv2.circle(screen_canvas, (final_x, final_y), 30, (0, 255, 255), -1)
            
        cv2.imshow("Gaze Tracker", screen_canvas)
        key = cv2.waitKey(1) & 0xFF
        if key == 27:
            break

cap.release()
cv2.destroyAllWindows()